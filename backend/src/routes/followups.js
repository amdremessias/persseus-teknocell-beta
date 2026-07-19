import prisma from '../lib/prisma.js';

export default async function followupRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/followups — lista follow-ups ativos com info do lead e atendente
  fastify.get('/api/followups', auth, async () => {
    const rows = await prisma.$queryRaw`
      SELECT
        bf.number,
        bf.lead_nome,
        bf.fu_stage,
        bf.next_fu_at,
        bf.abandono_ts,
        bf.updated_at,
        l.id          AS lead_id,
        COALESCE(l.nome, bf.lead_nome)  AS nome,
        l.metadata    AS lead_metadata,
        u.nome        AS atendente_nome
      FROM bia_followup bf
      LEFT JOIN LATERAL (
        SELECT id, nome, atendente_id, metadata
        FROM leads
        WHERE (telefone = bf.number OR identifier_canal = bf.number)
          AND canal = 'whatsapp'
        ORDER BY atualizado_em DESC
        LIMIT 1
      ) l ON true
      LEFT JOIN users u ON u.id = l.atendente_id
      WHERE bf.status = 'ativo'
      ORDER BY bf.next_fu_at ASC
    `;

    const items = rows.map((r) => {
      const meta = r.lead_metadata ?? {};
      return {
        number: r.number,
        nome: r.nome || r.number,
        fuStage: Number(r.fu_stage),
        nextFuAt: r.next_fu_at,
        abandonoTs: r.abandono_ts,
        leadId: r.lead_id || null,
        atendenteNome: r.atendente_nome || 'Bia',
        biaIntencao: meta.intencao ?? null,
        biaScore: meta.lead_score ?? null,
        biaEstado: meta.estado_atendimento ?? null,
        biaUrgencia: meta.urgencia ?? null,
      };
    });

    return { count: items.length, items };
  });

  // GET /api/followups/count — contador leve para o sidebar
  fastify.get('/api/followups/count', auth, async () => {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM bia_followup WHERE status = 'ativo'
    `;
    return { count: Number(result[0].count) };
  });

  // POST /api/followups/cancelar — encerra a sequência de um número
  fastify.post('/api/followups/cancelar', auth, async (req, reply) => {
    const { number } = req.body ?? {};
    if (!number) return reply.code(400).send({ error: 'number obrigatório' });

    const affected = await prisma.$executeRaw`
      UPDATE bia_followup
      SET status = 'cancelado', updated_at = NOW()
      WHERE number = ${number} AND status = 'ativo'
    `;

    return { ok: true, affected: Number(affected) };
  });
}
