import prisma from "../lib/prisma.js";

export default async function noteRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get("/api/leads/:id/notes", auth, async (req) => {
    const { id } = req.params;
    const notes = await prisma.leadNote.findMany({
      where: { leadId: id },
      orderBy: { criadoEm: "desc" },
      include: { user: { select: { id: true, nome: true } } },
    });
    return notes;
  });

  fastify.post("/api/leads/:id/notes", auth, async (req, reply) => {
    const { id } = req.params;
    const { conteudo } = req.body || {};
    if (!conteudo?.trim()) return reply.code(400).send({ error: "conteudo obrigatorio" });
    const note = await prisma.leadNote.create({
      data: {
        leadId: id,
        userId: req.user.id,
        conteudo: conteudo.trim(),
      },
      include: { user: { select: { id: true, nome: true } } },
    });
    fastify.io?.emit("lead:updated", { id });
    return note;
  });

  fastify.patch("/api/notes/:noteId", auth, async (req, reply) => {
    const { noteId } = req.params;
    const { conteudo } = req.body || {};
    if (!conteudo?.trim()) return reply.code(400).send({ error: "conteudo obrigatorio" });

    const existing = await prisma.leadNote.findUnique({ where: { id: noteId } });
    if (!existing) return reply.code(404).send({ error: "nota nao encontrada" });
    if (existing.userId !== req.user.id) return reply.code(403).send({ error: "apenas o autor pode editar" });

    const note = await prisma.leadNote.update({
      where: { id: noteId },
      data: { conteudo: conteudo.trim() },
      include: { user: { select: { id: true, nome: true } } },
    });
    fastify.io?.emit("lead:updated", { id: existing.leadId });
    return note;
  });

  fastify.delete("/api/notes/:noteId", auth, async (req, reply) => {
    const { noteId } = req.params;
    const existing = await prisma.leadNote.findUnique({ where: { id: noteId } });
    if (!existing) return reply.code(404).send({ error: "nota nao encontrada" });
    if (existing.userId !== req.user.id) return reply.code(403).send({ error: "apenas o autor pode excluir" });

    await prisma.leadNote.delete({ where: { id: noteId } });
    fastify.io?.emit("lead:updated", { id: existing.leadId });
    return { ok: true };
  });
}
