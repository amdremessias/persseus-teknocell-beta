import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

export default async function userRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get("/api/users", auth, async (req) => {
    return prisma.user.findMany({
      select: { id: true, nome: true, email: true, nivel: true, ativo: true, criadoEm: true },
      orderBy: { nome: "asc" },
    });
  });

  fastify.post("/api/users", auth, async (req, reply) => {
    if (req.user.nivel !== "admin") return reply.code(403).send({ error: "Acesso negado" });
    const { nome, email, senha, nivel } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);
    const user = await prisma.user.create({
      data: { nome, email, senhaHash, nivel: nivel || "atendente" },
      select: { id: true, nome: true, email: true, nivel: true, ativo: true },
    });
    return reply.code(201).send(user);
  });

  fastify.put("/api/users/:id", auth, async (req, reply) => {
    if (req.user.nivel !== "admin" && req.user.id !== req.params.id) {
      return reply.code(403).send({ error: "Acesso negado" });
    }
    const { nome, email, senha, nivel, ativo } = req.body;
    const data = { nome, email, nivel, ativo };
    if (senha) data.senhaHash = await bcrypt.hash(senha, 10);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, nome: true, email: true, nivel: true, ativo: true },
    });
    return user;
  });

  fastify.delete("/api/users/:id", auth, async (req, reply) => {
    if (req.user.nivel !== "admin") return reply.code(403).send({ error: "Acesso negado" });
    await prisma.user.update({ where: { id: req.params.id }, data: { ativo: false } });
    return { ok: true };
  });
}
