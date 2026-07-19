import prisma from '../lib/prisma.js';

export default async function posvendaRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/posvenda — sequências de pós-venda ativas (mesmo formato de /api/followups)
  fastify.get('/api/posvenda', auth, async () => {
    const rows = await prisma.$queryRaw`
      SELECT
        pv.venda_id,
        pv.number,
        pv.lead_nome,
        pv.produto,
        pv.pv_stage,
        pv.next_pv_at,
        pv.venda_ts,
        pv.postpone_count,
        pv.updated_at,
        l.id          AS lead_id,
        COALESCE(l.nome, pv.lead_nome)  AS nome,
        u.nome        AS atendente_nome
      FROM pos_venda_followup pv
      LEFT JOIN LATERAL (
        SELECT id, nome, atendente_id
        FROM leads
        WHERE (telefone = pv.number OR identifier_canal = pv.number)
          AND canal = 'whatsapp'
        ORDER BY atualizado_em DESC
        LIMIT 1
      ) l ON true
      LEFT JOIN users u ON u.id = l.atendente_id
      WHERE pv.status = 'ativo'
      ORDER BY pv.next_pv_at ASC
    `;

    const items = rows.map((r) => ({
      vendaId: r.venda_id,
      number: r.number,
      nome: r.nome || r.number,
      produto: r.produto,
      pvStage: Number(r.pv_stage),
      nextPvAt: r.next_pv_at,
      vendaTs: r.venda_ts,
      postponeCount: Number(r.postpone_count),
      leadId: r.lead_id || null,
      atendenteNome: r.atendente_nome || 'Bia',
    }));

    return { count: items.length, items };
  });

  // GET /api/posvenda/count — contador leve
  fastify.get('/api/posvenda/count', auth, async () => {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM pos_venda_followup WHERE status = 'ativo'
    `;
    return { count: Number(result[0].count) };
  });
}
