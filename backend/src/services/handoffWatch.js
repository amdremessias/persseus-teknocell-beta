import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import redis from "../lib/redis.js";
import { dispatchPushToUser } from "../lib/push.js";

// Re-alerta de handoff SEM DONO não assumido. O handoff da Bia cai de propósito
// sem atendente (quem vê, assume). Se ninguém assume, o lead fica esquecido com a
// Bia desligada — aqui reemitimos o banner e disparamos push até alguém pegar.
const PENDING_MIN_MS      = 10 * 60 * 1000;  // só re-alerta depois de 10 min pendente
const REALERT_EVERY_S     = 10 * 60;         // no máx 1 re-alerta / 10 min por lead (anti-spam)
const REALERT_MAX         = 3;               // no máx 3 re-alertas por lead
const REALERT_COUNT_TTL_S = 6 * 60 * 60;     // janela do contador de re-alertas

// Status terminais: lead já resolvido, nunca re-alerta.
const TERMINAL = ["convertido", "fechado", "finalizado", "concluido", "perdido", "arquivado", "pos_venda"];

let _io = null;
export function setHandoffIo(io) { _io = io; }

export async function checkPendingHandoffs() {
  try {
    // Auto-cura: limpa a marca de quem já foi assumido / voltou pra Bia / fechou
    // (cobre todos os caminhos de assumir/fechar sem ter que tocar em cada rota).
    await prisma.$executeRaw`
      UPDATE leads
      SET metadata = metadata - 'handoffPendenteDesde'
      WHERE metadata ? 'handoffPendenteDesde'
        AND (atendente_id IS NOT NULL OR bia_ativa = true OR status_pipeline IN (${Prisma.join(TERMINAL)}))
    `;

    const cutoff10 = new Date(Date.now() - PENDING_MIN_MS);

    // Pendentes de verdade: sem dono, Bia desligada, não-terminal, marcados há +10
    // min e SEM nenhuma mensagem de atendente desde a marca (se atendeu, tira da fila).
    const rows = await prisma.$queryRaw`
      SELECT l.id, l.nome, l.telefone, l.identifier_canal,
             (l.metadata->>'handoffPendenteDesde') AS pendente_desde
      FROM leads l
      WHERE l.metadata->>'handoffPendenteDesde' IS NOT NULL
        AND l.atendente_id IS NULL
        AND l.bia_ativa = false
        AND l.status_pipeline NOT IN (${Prisma.join(TERMINAL)})
        AND (l.metadata->>'handoffPendenteDesde')::timestamptz < ${cutoff10}
        AND NOT EXISTS (
          SELECT 1 FROM messages m
          WHERE m.lead_id = l.id AND m.tipo = 'atendente'
            AND m.criado_em > (l.metadata->>'handoffPendenteDesde')::timestamptz
        )
    `;
    if (rows.length === 0) return;

    // Destinatários do push: todos os usuários ativos (atendente/supervisor/admin).
    const users = await prisma.user.findMany({
      where: { ativo: true, nivel: { in: ["admin", "supervisor", "atendente"] } },
      select: { id: true },
    });

    for (const row of rows) {
      const lockKey  = `handoff:realert:${row.id}`;
      const countKey = `handoff:realert:count:${row.id}`;

      const count = parseInt((await redis.get(countKey)) || "0", 10);
      if (count >= REALERT_MAX) continue;          // teto de 3 re-alertas
      if (await redis.get(lockKey)) continue;      // ainda dentro da janela de 10 min

      await redis.set(lockKey, "1", "EX", REALERT_EVERY_S);
      const n = await redis.incr(countKey);
      await redis.expire(countKey, REALERT_COUNT_TTL_S);

      const nome = row.nome || row.telefone || row.identifier_canal || "Lead sem nome";
      const mins = Math.round((Date.now() - new Date(row.pendente_desde).getTime()) / 60000);

      // Reemite o banner de handoff (reaparece pra quem estiver com o CRM aberto).
      _io?.emit("handoff:new", {
        lead_id: row.id,
        lead_nome: nome,
        lead_telefone: row.telefone,
        handoff_reason: `Aguardando há ${mins} min — sem dono (re-alerta ${n}/${REALERT_MAX})`,
        agente_id: null,
        agente_nome: null,
        timestamp: new Date().toISOString(),
      });

      // Push pra todos os ativos (pega quem está sem o CRM aberto).
      const payload = { title: `⏰ Handoff aguardando há ${mins} min`, body: nome, url: `/chats?selected=${row.id}` };
      await Promise.all(users.map((u) => dispatchPushToUser(u.id, payload)));

      console.log(`[handoff-watch] re-alerta ${n}/${REALERT_MAX} lead=${row.id} "${nome}" (${mins} min, ${users.length} user(s))`);
    }
  } catch (err) {
    console.error("[handoff-watch] erro em checkPendingHandoffs:", err.message);
  }
}

// Limpa a marca de handoff pendente (chamado nos pontos de "assumir"). Idempotente.
export async function clearHandoffPendente(leadId) {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { metadata: true } });
    const meta = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata : null;
    if (!meta || meta.handoffPendenteDesde == null) return;
    const { handoffPendenteDesde, ...rest } = meta;
    void handoffPendenteDesde;
    await prisma.lead.update({ where: { id: leadId }, data: { metadata: rest } });
    await redis.del(`handoff:realert:${leadId}`, `handoff:realert:count:${leadId}`);
  } catch (err) {
    console.warn("[handoff-watch] clearHandoffPendente falhou:", err.message);
  }
}
