import prisma from "../lib/prisma.js";

// Contact.canal (string) → Lead Channel enum
const CANAL_MAP = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  messenger: "messenger",
  telegram: "telegram",
};

function mapCanal(c) {
  return CANAL_MAP[c] || "whatsapp";
}

const FINALIZED = ["convertido", "perdido", "arquivado"];

export default async function conversationRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.post("/api/conversations/from-contact", auth, async (req, reply) => {
    const { contactId } = req.body ?? {};
    if (!contactId) return reply.code(400).send({ error: "contactId obrigatorio" });

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return reply.code(404).send({ error: "contato nao encontrado" });

    const canal = mapCanal(contact.canal);

    // Return existing open lead for this contact (matched by phone + canal)
    if (contact.telefone) {
      const existing = await prisma.lead.findFirst({
        where: {
          telefone: contact.telefone,
          canal,
          NOT: { statusPipeline: { in: FINALIZED } },
        },
        orderBy: { criadoEm: "desc" },
      });
      if (existing) return { leadId: existing.id, isNew: false };
    }

    const lead = await prisma.lead.create({
      data: {
        nome: contact.nome,
        telefone: contact.telefone || null,
        email: contact.email || null,
        canal,
        identifierCanal: contact.telefone || null,
        statusPipeline: "novo",
        biaAtiva: false,
        tags: contact.tags || [],
      },
    });

    fastify.io?.emit("lead:new", { id: lead.id });

    return reply.code(201).send({ leadId: lead.id, isNew: true });
  });
}
