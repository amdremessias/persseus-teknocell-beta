import prisma from "../lib/prisma.js";
import {
  mercadophoneListTemplates,
  mercadophoneGetApprovedTemplateByName,
  mercadophoneSendTemplateByName,
  templateBodyText,
  renderTemplateBody,
} from "../channels/whatsapp/mercadophone-api.js";

// Variáveis {{n}} detectadas no body (ex: ["1","2"]).
function detectVars(text) {
  const nums = [...String(text ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(nums)].sort((a, b) => Number(a) - Number(b));
}

export default async function wabaTemplateRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/waba-templates — templates aprovados vindos do MercadoPhone.
  // Mesmo shape do antigo /api/templates (id, nome, texto, variaveis, canal, aprovadoMeta).
  fastify.get("/api/waba-templates", auth, async () => {
    const list = await mercadophoneListTemplates();
    return list
      .filter((t) => String(t?.status ?? "").toUpperCase() === "APPROVED")
      .map((t) => {
        const texto = templateBodyText(t.components);
        return {
          id: String(t.id ?? t.template_id ?? t.name),
          nome: t.name,
          texto,
          variaveis: detectVars(texto),
          canal: "whatsapp",
          aprovadoMeta: true,
          category: t.category ?? null,
        };
      });
  });

  // POST /api/leads/:id/waba-template — envia qualquer template aprovado por nome + variáveis.
  fastify.post("/api/leads/:id/waba-template", auth, async (req, reply) => {
    const { name, variables = {} } = req.body ?? {};
    if (!name) return reply.code(400).send({ error: "name obrigatório" });

    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado" });
    const number = lead.telefone || lead.identifierCanal;
    if (!number) return reply.code(400).send({ error: "Lead sem número" });

    const template = await mercadophoneGetApprovedTemplateByName(name);
    if (!template) return reply.code(404).send({ error: "Template não encontrado ou não aprovado" });

    // Meta rejeita parâmetro de texto vazio (#131008) — valida antes de enviar
    const requiredVars = detectVars(templateBodyText(template.components));
    const missing = requiredVars.filter((v) => !String(variables?.[v] ?? "").trim());
    if (missing.length > 0) {
      return reply.code(400).send({
        error: `Preencha o valor da variável {${missing.join("}, {")}} do template`,
      });
    }

    let wid = null;
    try {
      wid = await mercadophoneSendTemplateByName({ to: number, template, variables });
    } catch (err) {
      console.error("[waba-template] envio falhou:", err.message);
      return reply.code(502).send({ error: "Falha ao enviar template", detalhe: err.message });
    }

    // Envio direto pela Graph não gera eco do MercadoPhone → registra a mensagem aqui,
    // com o wid real (se um eco chegar, deduplica pelo externalMessageId @unique).
    const rendered = renderTemplateBody(template, variables) || `[template: ${name}]`;
    const msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo: "atendente",
        texto: rendered,
        canal: "whatsapp",
        deliveryStatus: "sent",
        ...(wid ? { externalMessageId: wid } : {}),
      },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { atualizadoEm: new Date() } });
    fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);

    return reply.code(201).send(msg);
  });
}
