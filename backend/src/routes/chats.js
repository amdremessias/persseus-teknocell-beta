import prisma from "../lib/prisma.js";

const FINALIZED_STATUSES = new Set(["convertido", "perdido", "arquivado"]);

function computeStatus(lead) {
  if (FINALIZED_STATUSES.has(lead.statusPipeline)) return "finalizado";
  if (lead.biaAtiva) return "bia_atendendo";
  if (lead.atendenteId) return "atendente_atendendo";
  return "aguardando";
}

export default async function chatRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get("/api/chats", auth, async (req) => {
    const { canal, atendenteId, tagId, search, assistencia, limit = 50, offset = 0 } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = Number(offset) || 0;

    const where = {};
    if (canal) where.canal = canal;
    if (atendenteId) where.atendenteId = atendenteId;
    if (tagId) where.leadTags = { some: { tagId } };
    // Assistência: leads marcados pela Bia (campo legado `tags`) OU pela tag relacional "Assistência"
    if (assistencia) {
      where.OR = [
        { tags: { has: "assistencia" } },
        { leadTags: { some: { tag: { nome: "Assistência" } } } },
      ];
    }
    if (search) {
      const searchOr = [
        { nome: { contains: search, mode: "insensitive" } },
        { telefone: { contains: search } },
        { messages: { some: { texto: { contains: search, mode: "insensitive" } } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { atualizadoEm: "desc" },
      take,
      skip,
      include: {
        atendente: { select: { id: true, nome: true } },
        messages: {
          take: 1,
          orderBy: { criadoEm: "desc" },
          select: { texto: true, criadoEm: true, tipo: true },
        },
        pin: { select: { pinnedAt: true } },
        readState: { select: { lastReadAt: true } },
      },
    });

    const items = await Promise.all(
      leads.map(async (lead) => {
        const lastReadAt = lead.readState?.lastReadAt ?? new Date(0);
        const unreadCount = await prisma.message.count({
          where: {
            leadId: lead.id,
            tipo: "cliente",
            criadoEm: { gt: lastReadAt },
          },
        });

        let notesCount = 0;
        try {
          notesCount = await prisma.leadNote.count({ where: { leadId: lead.id } });
        } catch { /* tabela ainda nao existe ate Bloco 5 rodar migration */ }

        let tagsFull = [];
        try {
          const links = await prisma.leadTag.findMany({
            where: { leadId: lead.id },
            include: { tag: true },
          });
          tagsFull = links.map((l) => ({ id: l.tag.id, nome: l.tag.nome, cor: l.tag.cor }));
        } catch { /* tabela ainda nao existe ate Bloco 4 rodar migration */ }

        const lastMessage = lead.messages[0]
          ? {
              texto: lead.messages[0].texto,
              criadoEm: lead.messages[0].criadoEm,
              tipo: lead.messages[0].tipo,
              fromMe: lead.messages[0].tipo !== "cliente",
            }
          : null;

        return {
          id: lead.id,
          nome: lead.nome,
          telefone: lead.telefone,
          canal: lead.canal,
          identifierCanal: lead.identifierCanal,
          lastMessage,
          unreadCount,
          status: computeStatus(lead),
          atendenteAtual: lead.atendente,
          biaAtiva: lead.biaAtiva,
          tags: tagsFull.length > 0 ? tagsFull : (lead.tags || []),
          pinned: !!lead.pin,
          notesCount,
        };
      })
    );

    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const ta = a.lastMessage ? new Date(a.lastMessage.criadoEm).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.criadoEm).getTime() : 0;
      return tb - ta;
    });

    const total = await prisma.lead.count({ where });
    return { items, total };
  });

  // Marca conversa como lida (zera unreadCount)
  fastify.post("/api/chats/:id/read", auth, async (req) => {
    const { id } = req.params;
    await prisma.leadReadState.upsert({
      where: { leadId: id },
      create: { leadId: id, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  });

  fastify.post("/api/chats/:id/pin", auth, async (req) => {
    const { id } = req.params;
    await prisma.leadPin.upsert({
      where: { leadId: id },
      create: { leadId: id },
      update: { pinnedAt: new Date() },
    });
    fastify.io?.emit("lead:updated", { id });
    return { ok: true, pinned: true };
  });

  fastify.delete("/api/chats/:id/pin", auth, async (req) => {
    const { id } = req.params;
    await prisma.leadPin.delete({ where: { leadId: id } }).catch(() => null);
    fastify.io?.emit("lead:updated", { id });
    return { ok: true, pinned: false };
  });

  fastify.get("/api/chats/stats", auth, async (req) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalConversasHoje,
      todosLeads,
      meuHoje,
      tmrRows,
    ] = await Promise.all([
      prisma.lead.count({ where: { atualizadoEm: { gte: startOfDay } } }),
      prisma.lead.findMany({
        select: { statusPipeline: true, biaAtiva: true, atendenteId: true },
      }),
      prisma.lead.count({
        where: {
          atendenteId: req.user.id,
          atualizadoEm: { gte: startOfDay },
        },
      }),
      prisma.$queryRaw`
        WITH ordered AS (
          SELECT lead_id, tipo, criado_em,
                 LAG(criado_em) OVER (PARTITION BY lead_id ORDER BY criado_em) AS prev_em,
                 LAG(tipo) OVER (PARTITION BY lead_id ORDER BY criado_em) AS prev_tipo
          FROM messages
          WHERE criado_em >= ${startOfDay}
        )
        SELECT AVG(EXTRACT(EPOCH FROM (criado_em - prev_em)) / 60.0)::float AS tmr
        FROM ordered
        WHERE prev_tipo = 'cliente' AND tipo = 'atendente'
      `,
    ]);

    let aguardando = 0;
    let bia = 0;
    let emAtendimento = 0;
    let finalizadas = 0;
    for (const l of todosLeads) {
      if (["convertido", "perdido", "arquivado"].includes(l.statusPipeline)) {
        finalizadas++;
      } else if (l.biaAtiva) {
        bia++;
      } else if (l.atendenteId) {
        emAtendimento++;
      } else {
        aguardando++;
      }
    }

    const tmrRaw = tmrRows?.[0]?.tmr;
    const tempoMedioResposta = tmrRaw == null ? null : Math.round(Number(tmrRaw));

    return {
      hoje: {
        total_conversas: totalConversasHoje,
        finalizadas,
        aguardando,
        em_atendimento: emAtendimento,
        bia_atendendo: bia,
      },
      tempo_medio_resposta_minutos: tempoMedioResposta,
      meu_atendimento_hoje: meuHoje,
    };
  });
}
