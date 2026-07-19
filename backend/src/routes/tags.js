import prisma from "../lib/prisma.js";

export default async function tagRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get("/api/tags", auth, async () => {
    const tags = await prisma.tag.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { leadTags: true } } },
    });
    return tags.map((t) => ({
      id: t.id,
      nome: t.nome,
      cor: t.cor,
      leadCount: t._count.leadTags,
    }));
  });

  fastify.post("/api/tags", auth, async (req, reply) => {
    const { nome, cor } = req.body || {};
    if (!nome?.trim()) return reply.code(400).send({ error: "nome obrigatorio" });
    try {
      const tag = await prisma.tag.create({
        data: { nome: nome.trim(), cor: cor || "#1B5E20" },
      });
      return tag;
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "tag ja existe" });
      throw err;
    }
  });

  fastify.patch("/api/tags/:id", auth, async (req, reply) => {
    const { id } = req.params;
    const { nome, cor } = req.body || {};
    const data = {};
    if (nome !== undefined) data.nome = nome.trim();
    if (cor !== undefined) data.cor = cor;
    try {
      const tag = await prisma.tag.update({ where: { id }, data });
      return tag;
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "tag nao encontrada" });
      throw err;
    }
  });

  fastify.delete("/api/tags/:id", auth, async (req) => {
    const { id } = req.params;
    await prisma.tag.delete({ where: { id } }).catch(() => null);
    return { ok: true };
  });

  // Tags aplicadas a um lead
  fastify.get("/api/leads/:id/tags", auth, async (req) => {
    const { id } = req.params;
    const links = await prisma.leadTag.findMany({
      where: { leadId: id },
      include: { tag: true },
    });
    return links.map((l) => ({ id: l.tag.id, nome: l.tag.nome, cor: l.tag.cor }));
  });

  fastify.post("/api/leads/:id/tags", auth, async (req, reply) => {
    const { id } = req.params;
    const { tag_id, tagId } = req.body || {};
    const tagIdValue = tag_id || tagId;
    if (!tagIdValue) return reply.code(400).send({ error: "tag_id obrigatorio" });
    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId: id, tagId: tagIdValue } },
      create: { leadId: id, tagId: tagIdValue },
      update: {},
    });
    fastify.io?.emit("lead:updated", { id });
    return { ok: true };
  });

  fastify.delete("/api/leads/:id/tags/:tagId", auth, async (req) => {
    const { id, tagId } = req.params;
    await prisma.leadTag.delete({
      where: { leadId_tagId: { leadId: id, tagId } },
    }).catch(() => null);
    fastify.io?.emit("lead:updated", { id });
    return { ok: true };
  });
}
