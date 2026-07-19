import prisma from "../lib/prisma.js";

export default async function quickReplyRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/quick-replies — retorna do escopo company + do user atual
  fastify.get("/api/quick-replies", auth, async (req) => {
    const items = await prisma.quickReply.findMany({
      where: {
        OR: [
          { escopo: "company" },
          { escopo: "user", userId: req.user.id },
        ],
      },
      orderBy: { atalho: "asc" },
    });
    return items;
  });

  fastify.post("/api/quick-replies", auth, async (req, reply) => {
    const { atalho, texto, escopo = "company" } = req.body || {};
    if (!atalho?.trim()) return reply.code(400).send({ error: "atalho obrigatorio" });
    if (!texto?.trim())  return reply.code(400).send({ error: "texto obrigatorio" });
    if (!["company", "user"].includes(escopo)) return reply.code(400).send({ error: "escopo invalido" });

    try {
      const item = await prisma.quickReply.create({
        data: {
          atalho: atalho.trim().replace(/^\/+/, ""),
          texto: texto.trim(),
          escopo,
          userId: escopo === "user" ? req.user.id : null,
        },
      });
      return item;
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "atalho ja existe nesse escopo" });
      throw err;
    }
  });

  fastify.patch("/api/quick-replies/:id", auth, async (req, reply) => {
    const { id } = req.params;
    const { atalho, texto, escopo } = req.body || {};
    const existing = await prisma.quickReply.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "atalho nao encontrado" });
    if (existing.escopo === "user" && existing.userId !== req.user.id) {
      return reply.code(403).send({ error: "atalho de outro usuario" });
    }

    const data = {};
    if (atalho !== undefined) data.atalho = atalho.trim().replace(/^\/+/, "");
    if (texto !== undefined)  data.texto = texto.trim();
    if (escopo !== undefined) {
      data.escopo = escopo;
      data.userId = escopo === "user" ? req.user.id : null;
    }

    try {
      return await prisma.quickReply.update({ where: { id }, data });
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "atalho ja existe nesse escopo" });
      throw err;
    }
  });

  fastify.delete("/api/quick-replies/:id", auth, async (req, reply) => {
    const { id } = req.params;
    const existing = await prisma.quickReply.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "nao encontrado" });
    if (existing.escopo === "user" && existing.userId !== req.user.id) {
      return reply.code(403).send({ error: "atalho de outro usuario" });
    }
    await prisma.quickReply.delete({ where: { id } });
    return { ok: true };
  });
}
