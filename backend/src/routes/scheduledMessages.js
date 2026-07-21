import prisma from "../lib/prisma.js";

const OPEN_STATUSES = ["pendente", "enviado", "falhou"];

export default async function scheduledMessageRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // Lista os agendamentos (não cancelados) de um lead, mais recentes primeiro.
  fastify.get("/api/leads/:id/scheduled-messages", auth, async (req) => {
    return prisma.scheduledMessage.findMany({
      where: { leadId: req.params.id, status: { in: OPEN_STATUSES } },
      orderBy: { scheduledAt: "asc" },
      take: 20,
    });
  });

  fastify.post("/api/leads/:id/scheduled-messages", auth, async (req, reply) => {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado" });

    const { tipo, texto, templateNome, templateVariaveis, scheduledAt } = req.body ?? {};

    if (tipo !== "texto" && tipo !== "template") {
      return reply.code(400).send({ error: "tipo deve ser 'texto' ou 'template'" });
    }
    if (tipo === "texto" && !texto?.trim()) {
      return reply.code(400).send({ error: "texto obrigatorio" });
    }
    if (tipo === "template" && !templateNome?.trim()) {
      return reply.code(400).send({ error: "templateNome obrigatorio" });
    }

    const when = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(when.getTime())) {
      return reply.code(400).send({ error: "scheduledAt invalido" });
    }
    if (when.getTime() <= Date.now()) {
      return reply.code(400).send({ error: "scheduledAt precisa ser no futuro" });
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        leadId: lead.id,
        tipo,
        texto: tipo === "texto" ? texto.trim() : null,
        templateNome: tipo === "template" ? templateNome.trim() : null,
        templateVariaveis: tipo === "template" ? (templateVariaveis || {}) : undefined,
        scheduledAt: when,
        criadoPorId: req.user.id,
      },
    });

    return reply.code(201).send(scheduled);
  });

  fastify.delete("/api/scheduled-messages/:id", auth, async (req, reply) => {
    const existing = await prisma.scheduledMessage.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "Agendamento não encontrado" });
    if (existing.status !== "pendente") {
      return reply.code(400).send({ error: "Só é possível cancelar agendamentos pendentes" });
    }

    const updated = await prisma.scheduledMessage.update({
      where: { id: req.params.id },
      data: { status: "cancelado" },
    });
    return updated;
  });
}
