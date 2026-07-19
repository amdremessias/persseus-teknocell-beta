import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import redis from "../lib/redis.js";
import { dispatchPushToUser } from "../lib/push.js";

const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;  // 5 min
const WATCHDOG_STALE_MS    = 15 * 60 * 1000; // 15 min sem resposta (lower bound)
const WATCHDOG_MAX_MS      =  3 * 60 * 60 * 1000; // 3h — acima disso não alerta (já encerrado)
const WATCHDOG_TTL_S       = 15 * 60;        // anti-spam: 1x por lead a cada 15 min
const FAXINA_STALE_DEFAULT_H = 168;          // 7 dias sem atividade → marcar como perdido (alinhado ao FU6)

// Status terminais que a faxina NUNCA sobrescreve.
const FAXINA_SKIP_STATUSES = [
  "convertido", "fechado", "finalizado", "concluido",
  "perdido", "arquivado", "pos_venda", "parado",
];

// ── Peça 3: leads com cliente aguardando resposta há mais de 15 min ──────────

export async function checkStaleLeads() {
  try {
    const cutoff15 = new Date(Date.now() - WATCHDOG_STALE_MS);
    const cutoff3h  = new Date(Date.now() - WATCHDOG_MAX_MS);

    // Leads com atendente atribuído, bia desativada, cuja ÚLTIMA mensagem é do
    // cliente e está na janela entre 15 min e 3 h (mais de 3h = conversa encerrada, ignora)
    const stale = await prisma.$queryRaw`
      SELECT l.id, l.nome, l.telefone, l.identifier_canal, l.atendente_id
      FROM leads l,
      LATERAL (
        SELECT tipo, criado_em
        FROM messages
        WHERE lead_id = l.id
        ORDER BY criado_em DESC
        LIMIT 1
      ) last_msg
      WHERE l.atendente_id IS NOT NULL
        AND l.bia_ativa = false
        AND last_msg.tipo = 'cliente'
        AND last_msg.criado_em < ${cutoff15}
        AND last_msg.criado_em > ${cutoff3h}
    `;

    if (stale.length === 0) return;
    console.log(`[watchdog] ${stale.length} lead(s) aguardando resposta há 15 min–3h`);

    for (const row of stale) {
      const key = `push:watchdog:${row.id}`;
      const alreadySent = await redis.get(key);
      if (alreadySent) continue;

      await redis.set(key, "1", "EX", WATCHDOG_TTL_S);

      const nome = row.nome || row.telefone || row.identifier_canal || "Lead sem nome";
      console.log(`[watchdog] notificando atendenteId=${row.atendente_id} sobre lead=${row.id} "${nome}"`);

      await dispatchPushToUser(row.atendente_id, {
        title: "⚠️ Lead aguardando resposta há +15 min",
        body: nome,
        url: `/chats?selected=${row.id}`,
      });
    }
  } catch (err) {
    console.error("[watchdog] erro em checkStaleLeads:", err.message);
  }
}

// ── Peça 4: faxina diária às 06h BRT (09:00 UTC) ─────────────────────────────

// Janela da faxina (horas). Lê Setting faxina_stale_hours; fallback validado.
async function getFaxinaStaleHours() {
  const row = await prisma.setting.findUnique({ where: { chave: "faxina_stale_hours" } });
  const raw = row?.valor;
  if (raw && raw.trim()) {
    const n = parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
    console.warn(`[faxina] faxina_stale_hours inválida ("${raw}") — usando default ${FAXINA_STALE_DEFAULT_H}`);
  }
  return FAXINA_STALE_DEFAULT_H;
}

async function ensureFaxinaDefaults() {
  await prisma.setting.upsert({
    where: { chave: "faxina_stale_hours" },
    create: { chave: "faxina_stale_hours", valor: String(FAXINA_STALE_DEFAULT_H) },
    update: {}, // nunca sobrescreve valor customizado
  });
}

async function runFaxina() {
  try {
    await ensureFaxinaDefaults();
    const staleHours = await getFaxinaStaleHours();
    const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    const tempoTxt = staleHours % 24 === 0
      ? `${staleHours / 24} dia${staleHours / 24 === 1 ? "" : "s"}`
      : `${staleHours} horas`;

    // Leads com atendente cujo ÚLTIMO movimento (qualquer mensagem) passou da janela.
    // Nunca toca em status terminais (evita rebaixar 'convertido', 'perdido', etc).
    const stale = await prisma.$queryRaw`
      SELECT l.id, l.nome, l.canal_mensagem
      FROM leads l,
      LATERAL (
        SELECT criado_em
        FROM messages
        WHERE lead_id = l.id
        ORDER BY criado_em DESC
        LIMIT 1
      ) last_msg
      WHERE l.atendente_id IS NOT NULL
        AND l.bia_ativa = false
        AND last_msg.criado_em < ${cutoff}
        AND l.status_pipeline NOT IN (${Prisma.join(FAXINA_SKIP_STATUSES)})
    `;

    console.log(`[faxina] ${stale.length} lead(s) a marcar como perdido (janela ${tempoTxt})`);

    for (const row of stale) {
      await prisma.lead.update({
        where: { id: row.id },
        data: { statusPipeline: "perdido" },
      });
      await prisma.message.create({
        data: {
          leadId: row.id,
          tipo: "interno",
          texto: `🧹 Marcado como perdido automaticamente (sem atividade há ${tempoTxt})`,
          canal: row.canal_mensagem,
        },
      });
      console.log(`[faxina] lead=${row.id} "${row.nome}" marcado como perdido`);
    }

    console.log(`[faxina] concluída — ${stale.length} lead(s) marcados como perdido`);
  } catch (err) {
    console.error("[faxina] erro:", err.message);
  }
}

function msUntilNextUtc9() {
  const now = new Date();
  const next = new Date();
  next.setUTCHours(9, 0, 0, 0); // 09:00 UTC = 06:00 BRT
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next - now;
}

export function scheduleFaxina() {
  const delay = msUntilNextUtc9();
  const nextRun = new Date(Date.now() + delay);
  console.log(`[faxina] próxima execução às ${nextRun.toISOString()} (em ${Math.round(delay / 60000)} min)`);
  setTimeout(async () => {
    await runFaxina();
    scheduleFaxina(); // reagenda para o próximo dia
  }, delay);
}
