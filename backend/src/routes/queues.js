import prisma from "../lib/prisma.js";

const STRATEGIES = new Set(["round_robin", "least_busy", "skill_based", "manual"]);
const PROFILES = new Set(["atendente", "supervisor", "gestor"]);

function adminGuard(req, reply) {
  if (req.user.nivel !== "admin") {
    return reply.code(403).send({ error: "Acesso restrito a administradores" });
  }
}

const BASE_INCLUDE = {
  team: { select: { id: true, nome: true, cor: true, ativo: true } },
  members: {
    include: { user: { select: { id: true, nome: true, email: true, nivel: true, ativo: true } } },
    orderBy: [{ prioridade: "desc" }, { criadoEm: "asc" }],
  },
  _count: { select: { assignments: true } },
};

export default async function queueRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };
  const admin = { onRequest: [fastify.authenticate], preHandler: async (req, reply) => adminGuard(req, reply) };

  // Filas para filtro no chat: usuário vê as filas em que participa;
  // admin/supervisor vêem todas as ativas.
  fastify.get("/api/queues/my", auth, async (req) => {
    const isBoss = req.user.nivel === "admin" || req.user.nivel === "supervisor";
    const where = isBoss
      ? { ativa: true }
      : { ativa: true, members: { some: { userId: req.user.id, ativo: true } } };
    const queues = await prisma.attendanceQueue.findMany({
      where,
      select: { id: true, nome: true, cor: true },
      orderBy: { nome: "asc" },
    });
    return queues;
  });

  // Lista completa (admin: gestão) — com membros, time e volume de atribuições
  fastify.get("/api/queues", auth, async () => {
    const queues = await prisma.attendanceQueue.findMany({
      orderBy: { nome: "asc" },
      include: MEM_INCLUDE,
    });

    // nº de leads "em aberto" por fila (atribuições ativas sem conclusão)
    const counts = await prisma.queueAssignment.groupBy({
      by: ["queueId"],
      where: { assumidoEm: null, timeoutEm: { gt: new Date() } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.queueId, c._count._all]));
    return queues.map((q) => ({ ...q, abiertos: countMap.get(q.id) ?? 0 }));
  });

  fastify.post("/api/queues", admin, async (req, reply) => {
    const body = req.body ?? {};
    if (!body.nome?.trim()) return reply.code(400).send({ error: "nome obrigatorio" });
    if (body.estrategiaAtribuicao && !STRATEGIES.has(body.estrategiaAtribuicao)) {
      return reply.code(400).send({ error: "estrategia_invalida" });
    }

    const { nome, descricao, cor, ativa, horarioInicio, horarioFim, diasSemana, estrategiaAtribuicao, maxLeadsPorAtendente, timeoutSegundos, teamId, members } = body;

    try {
      const queue = await prisma.attendanceQueue.create({
        data: {
          nome: nome.trim(),
          descricao: descricao ?? null,
          cor: cor ?? "#1B5E20",
          ativa: ativa !== undefined ? !!ativa : true,
          horarioInicio: horarioInicio ?? null,
          horarioFim: horarioFim ?? null,
          diasSemana: Array.isArray(diasSemana) ? diasSemana : [1, 2, 3, 4, 5],
          estrategiaAtribuicao: estrategiaAtribuicao ?? "round_robin",
          maxLeadsPorAtendente: maxLeadsPorAtendente ?? 20,
          timeoutSegundos: timeoutSegundos ?? 120,
          teamId: teamId || null,
          ...(Array.isArray(members) && members.length
            ? {
                members: {
                  create: members
                    .filter((m) => m && m.userId)
                    .map((m) => ({
                      userId: m.userId,
                      profile: PROFILES_SANITIZE(m.profile),
                      prioridade: Number(m.prioridade) || 0,
                      ativo: m.ativo !== undefined ? !!m.ativo : true,
                    })),
                },
              }
            : {}),
        },
        include: MEM_INCLUDE,
      });
      return reply.code(201).send(queue);
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "Já existe uma fila com este nome" });
      throw err;
    }
  });

  fastify.put("/api/queues/:id", admin, async (req, reply) => {
    const existing = await prisma.attendanceQueue.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "Fila não encontrada" });

    const body = req.body ?? {};
    if (body.estrategiaAtribuicao && !STRATEGIES.has(body.estrategiaAtribuicao)) {
      return reply.code(400).send({ error: "estrategia_invalida" });
    }
    const data = {};
    for (const k of ["nome", "descricao", "cor", "horarioInicio", "horarioFim", "teamId"]) {
      if (body[k] !== undefined) data[k] = body[k] === "" ? null : body[k];
    }
    if (body.ativa !== undefined) data.ativa = !!body.ativa;
    if (body.diasSemana !== undefined) data.diasSemana = body.diasSemana;
    if (body.estrategiaAtribuicao !== undefined) data.estrategiaAtribuicao = body.estrategiaAtribuicao;
    if (body.maxLeadsPorAtendente !== undefined) data.maxLeadsPorAtendente = Number(body.maxLeadsPorAtendente) || null;
    if (body.timeoutSegundos !== undefined) data.timeoutSegundos = Number(body.timeoutSegundos) || 120;

    try {
      return await prisma.attendanceQueue.update({ where: { id: req.params.id }, data });
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "Já existe uma fila com este nome" });
      throw err;
    }
  });

  fastify.delete("/api/queues/:id", admin, async (req, reply) => {
    const existing = await prisma.attendanceQueue.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "Fila não encontrada" });
    await prisma.attendanceQueue.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  // Substitui os membros da fila (vínculos por perfil + prioridade)
  fastify.put("/api/queues/:id/members", admin, async (req, reply) => {
    const queue = await prisma.attendanceQueue.findUnique({ where: { id: req.params.id } });
    if (!queue) return reply.code(404).send({ error: "Fila não encontrada" });

    const { members } = req.body ?? {};
    if (!Array.isArray(members)) return reply.code(400).send({ error: "members deve ser uma lista" });

    const clean = members
      .filter((m) => m && m.userId && PROFILES.has(m.profile))
      .map((m) => ({
        userId: m.userId,
        profile: m.profile,
        prioridade: Number(m.prioridade) || 0,
        ativo: m.ativo !== undefined ? !!m.ativo : true,
      }));

    const userIds = clean.map((m) => m.userId);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
    const validIds = new Set(users.map((u) => u.id));
    const final = clean.filter((m) => validIds.has(m.userId));

    await prisma.$transaction([
      prisma.queueMember.deleteMany({ where: { queueId: queue.id } }),
      ...final.map((m) =>
        prisma.queueMember.upsert({
          where: { queueId_userId: { queueId: queue.id, userId: m.userId } },
          update: { profile: m.profile, prioridade: m.prioridade, ativo: m.ativo },
          create: { queueId: queue.id, userId: m.userId, profile: m.profile, prioridade: m.prioridade, ativo: m.ativo },
        })
      ),
    ]);

    const membersFull = await prisma.queueMember.findMany({
      where: { queueId: queue.id },
      include: { user: { select: { id: true, nome: true, email: true, nivel: true, ativo: true } } },
      orderBy: [{ prioridade: "desc" }, { criadoEm: "asc" }],
    });
    return { members: membersFull };
  });
}

const MEM_INCLUDE = {
  team: { select: { id: true, nome: true, cor: true, ativo: true } },
  members: {
    include: { user: { select: { id: true, nome: true, email: true, nivel: true, ativo: true } } },
    orderBy: [{ prioridade: "desc" }, { criadoEm: "asc" }],
  },
  _count: { select: { assignments: true } },
};

function PROFILES_SANITIZE(p) {
  return PROFILES.has(p) ? p : "atendente";
}