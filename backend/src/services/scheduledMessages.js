import prisma from "../lib/prisma.js";
import { sendTextMessage } from "./outgoing.js";
import {
  mercadophoneGetApprovedTemplateByName,
  mercadophoneSendTemplateByName,
  renderTemplateBody,
} from "../channels/whatsapp/mercadophone-api.js";

async function sendTemplateScheduled(sm) {
  const template = await mercadophoneGetApprovedTemplateByName(sm.templateNome);
  if (!template) throw new Error("template não encontrado ou não aprovado");

  const number = sm.lead.telefone || sm.lead.identifierCanal;
  if (!number) throw new Error("lead sem número");

  const variables = sm.templateVariaveis || {};
  const wid = await mercadophoneSendTemplateByName({ to: number, template, variables });
  const rendered = renderTemplateBody(template, variables) || `[template: ${sm.templateNome}]`;

  return prisma.message.create({
    data: {
      leadId: sm.leadId,
      tipo: "atendente",
      texto: rendered,
      canal: "whatsapp",
      deliveryStatus: "sent",
      ...(wid ? { externalMessageId: wid } : {}),
    },
  });
}

async function sendTextScheduled(sm) {
  if (!sm.lead.telefone) throw new Error("lead sem telefone");

  const extId = await sendTextMessage({
    to: sm.lead.telefone,
    text: sm.texto,
    canal: sm.lead.canalMensagem || "whatsapp",
  });
  if (!extId) throw new Error("envio falhou — janela de 24h provavelmente fechada");

  return prisma.message.create({
    data: {
      leadId: sm.leadId,
      tipo: "atendente",
      texto: sm.texto,
      canal: sm.lead.canalMensagem || "whatsapp",
      deliveryStatus: "sent",
      externalMessageId: extId,
    },
  });
}

export async function runScheduledMessagesJob(io) {
  const due = await prisma.scheduledMessage.findMany({
    where: { status: "pendente", scheduledAt: { lte: new Date() } },
    include: { lead: true },
  });

  for (const sm of due) {
    try {
      if (!sm.lead) throw new Error("lead não encontrado");

      const msg = sm.tipo === "template" ? await sendTemplateScheduled(sm) : await sendTextScheduled(sm);

      await prisma.lead.update({ where: { id: sm.leadId }, data: { atualizadoEm: new Date() } });
      io?.to(`lead:${sm.leadId}`).emit("message:new", msg);
      await prisma.scheduledMessage.update({
        where: { id: sm.id },
        data: { status: "enviado", enviadoEm: new Date() },
      });
    } catch (err) {
      console.error(`[scheduledMessages] falha ao enviar ${sm.id}:`, err.message);
      await prisma.scheduledMessage
        .update({ where: { id: sm.id }, data: { status: "falhou", erro: err.message.slice(0, 300) } })
        .catch(() => null);
    }
  }
}
