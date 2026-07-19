import prisma from "../lib/prisma.js";

export default async function statsRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get("/api/stats/dashboard", auth, async (req) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalLeads, convertidos, atendentes, messagesByDay] = await Promise.all([
      prisma.lead.count({ where: { criadoEm: { gte: since } } }),
      prisma.lead.count({ where: { statusPipeline: "convertido", atualizadoEm: { gte: since } } }),
      prisma.lead.groupBy({
        by: ["atendenteId"],
        where: { statusPipeline: "convertido", atualizadoEm: { gte: since } },
        _count: { id: true },
      }),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', criado_em)::date as day, COUNT(*)::int as total
        FROM messages
        WHERE criado_em >= ${since}
        GROUP BY day ORDER BY day
      `,
    ]);

    const taxaConversao = totalLeads > 0 ? ((convertidos / totalLeads) * 100).toFixed(1) : 0;

    const atendenteIds = atendentes.map((a) => a.atendenteId).filter(Boolean);
    const userMap = {};
    if (atendenteIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: atendenteIds } },
        select: { id: true, nome: true },
      });
      users.forEach((u) => (userMap[u.id] = u.nome));
    }

    const comissaoPorAtendente = atendentes.map((a) => ({
      atendenteId: a.atendenteId,
      nome: userMap[a.atendenteId] || "Desconhecido",
      conversoes: a._count.id,
    }));

    return {
      periodo: "30 dias",
      totalLeads,
      convertidos,
      taxaConversao: Number(taxaConversao),
      comissaoPorAtendente,
      messagesByDay,
    };
  });

  // Contagem de leads por origem nos últimos 30 dias (ads vs organico).
  // Lead sem metadata.origem = origem implícita "organico".
  fastify.get("/api/stats/origens", auth, async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(metadata->>'origem', 'organico') AS origem, COUNT(*)::int AS n
      FROM leads
      WHERE criado_em >= ${since}
      GROUP BY 1
    `;

    const porOrigem = {};
    let total = 0;
    for (const r of rows) {
      porOrigem[r.origem] = Number(r.n);
      total += Number(r.n);
    }

    return { periodo: "30 dias", total, porOrigem };
  });
}
