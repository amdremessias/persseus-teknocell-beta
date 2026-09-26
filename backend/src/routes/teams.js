import prisma from "../lib/prisma.js";

const PAPEIS = new Set(["lider", "supervisor", "membro"]);

function adminGuard(req, reply) {
  if (req.user.nivel !== "admin") {
    return reply.code(403).send({ error: "Acesso restrito a administradores" });
  }
}

export default async function teamRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };
  const admin = { onRequest: [fastify.authenticate], preHandler: async (req, reply) => adminGuard(req, reply) };

  // Lista de grupos/times com membros e quantidade de filas
  fastify.get("/api/teams", auth, async () => {
    return prisma.team.findMany({
      orderBy: { nome: "asc" },
      include: {
        members: {
          include: {
            user: { select: { id: true, nome: true, email: true, nivel: true, ativo: true } },
          },
          orderBy: { criadoEm: "asc" },
        },
        _count: { select: { queues: true } },
      },
    });
  });

  fastify.post("/api/teams", admin, async (req, reply) => {
    const { nome, descricao, cor } = req.body ?? {};
    if (!nome?.trim()) return reply.code(400).send({ error: "nome obrigatorio" });
    try {
      const team = await prisma.team.create({
        data: { nome: nome.trim(), descricao: descricao || null, cor: cor || "#1B5E20" },
        include: {
          members: {
            include: { user: { select: { id: true, nome: true, email: true, nivel: true, ativo: true } } },
          },
        },
      });
      return reply.code(201).send(team);
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "Já existe um grupo com este nome" });
      throw err;
    }
  });

  fastify.put("/api/teams/:id", admin, async (req, reply) => {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "Grupo não encontrado" });

    const { nome, descricao, cor, ativo } = req.body ?? {};
    const data = {};
    if (nome !== undefined) data.nome = String(nome).trim();
    if (descricao !== undefined) data.descricao = descricao;
    if (cor !== undefined) data.cor = cor;
    if (ativo !== undefined) data.ativo = !!ativo;

    try {
      return await prisma.team.update({ where: { id: req.params.id }, data });
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "Já existe um grupo com este nome" });
      throw err;
    }
  });

  fastify.delete("/api/teams/:id", admin, async (req, reply) => {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "Grupo não encontrado" });
    await prisma.team.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  // Substitui os membros do grupo (associando usuários, com papel)
  fastify.put("/api/teams/:id/members", admin, async (req, reply) => {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return reply.code(404).send({ error: "Grupo não encontrado" });

    const { members } = req.body ?? {};
    if (!Array.isArray(members)) return reply.code(400).send({ error: "members deve ser uma lista" });

    const clean = members
      .filter((m) => m && m.userId && PAPEIS.has(m.papel))
      .map((m) => ({ userId: m.userId, papel: m.papel }));

    const userIds = clean.map((m) => m.userId);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
    const validIds = new Set(users.map((u) => u.id));
    const final = clean.filter((m) => validIds.has(m.userId));

    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { teamId: team.id } }),
      ...final.map((m) =>
        prisma.teamMember.upsert({
          where: { teamId_userId: { teamId: team.id, userId: m.userId } },
          update: { papel: m.papel },
          create: { teamId: team.id, userId: m.userId, papel: m.papel },
        })
      ),
    ]);

    const membersFull = await prisma.teamMember.findMany({
      where: { teamId: team.id },
      include: { user: { select: { id: true, nome: true, email: true, nivel: true, ativo: true } } },
      orderBy: { criadoEm: "asc" },
    });
    return { members: membersFull };
  });
}