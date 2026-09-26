import prisma from "../lib/prisma.js";
import { toE164BrazilMobile, phoneVariants, formatBrazilPhoneDisplay } from "../utils/phone.js";
import { ensureOpenTicket } from "../services/tickets.js";

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

    const { ticket, isNew } = await ensureOpenTicket({ leadId: lead.id, canal }).catch(() => ({ ticket: null, isNew: false }));
    if (isNew) console.log(`[conversations] novo ticket #${ticket?.numero} lead=${lead.id} (from-contact)`);

    fastify.io?.emit("lead:new", { id: lead.id });

    return reply.code(201).send({ leadId: lead.id, isNew: true });
  });

  // Inicia (ou reabre) uma conversa a partir de um telefone digitado manualmente,
  // sem depender de um Contact pré-cadastrado.
  fastify.post("/api/conversations/from-phone", auth, async (req, reply) => {
    const { telefone } = req.body ?? {};
    if (!telefone?.trim()) return reply.code(400).send({ error: "telefone obrigatorio" });

    const canonical = toE164BrazilMobile(telefone);
    if (!canonical) return reply.code(400).send({ error: "telefone invalido" });

    const variants = phoneVariants(telefone);

    // Tolerante ao 9º dígito e a leads antigos gravados em `telefone` (não em `identifierCanal`)
    const existing = await prisma.lead.findFirst({
      where: {
        canal: "whatsapp",
        NOT: { statusPipeline: { in: FINALIZED } },
        OR: [
          { identifierCanal: { in: variants } },
          { telefone: { in: variants } },
        ],
      },
      orderBy: { criadoEm: "desc" },
    });
    if (existing) return { leadId: existing.id, isNew: false };

    const lead = await prisma.lead.create({
      data: {
        nome: formatBrazilPhoneDisplay(canonical),
        telefone: canonical,
        canal: "whatsapp",
        identifierCanal: canonical,
        statusPipeline: "novo",
        biaAtiva: false,
        tags: [],
      },
    });

    const { ticket, isNew } = await ensureOpenTicket({ leadId: lead.id, canal: "whatsapp" }).catch(() => ({ ticket: null, isNew: false }));
    if (isNew) console.log(`[conversations] novo ticket #${ticket?.numero} lead=${lead.id} (from-phone)`);

    fastify.io?.emit("lead:new", { id: lead.id });

    return reply.code(201).send({ leadId: lead.id, isNew: true });
  });
}
