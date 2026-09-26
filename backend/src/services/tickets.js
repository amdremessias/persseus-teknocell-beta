// ── TICKETS DE ATENDIMENTO ──────────────────────────────────────────────────
// Cada conversa recebe um número de protocolo sequencial (ticket). Um ticket
// nasce "aberto" no primeiro contato (ou na reabertura após finalização) e é
// encerrado quando o atendente finaliza a conversa (arquivado/convertido/perdido).
// Quando o mesmo contato volta a falar depois de finalizado, um NOVO ticket é
// aberto e o fluxo de menu (boas-vindas + opções) reinicia.
import prisma from "../lib/prisma.js";

const TERMINAL_STATUSES = new Set(["convertido", "perdido", "arquivado"]);

// Lead "finalizado" = encerrado para consulta posterior (sai da fila ativa).
// Detecção dupla: status terminal OU dataArquivamento preenchido (arquivado via
// n8n/BIA não seta statusPipeline, só a data).
export function isLeadFinalizado(lead) {
  if (!lead) return false;
  return TERMINAL_STATUSES.has(lead.statusPipeline) || !!lead.dataArquivamento;
}

export async function getTicketNumero(leadId) {
  const last = await prisma.ticket.findFirst({
    where: { leadId },
    orderBy: { abertoEm: "desc" },
    select: { numero: true },
  });
  return last?.numero ?? null;
}

// Garante um ticket ABERTO para o lead. Retorna { ticket, isNew }.
// O número sequencial é gerado pelo banco (SERIAL) — nunca reaproveitado.
export async function ensureOpenTicket({ leadId, canal = "whatsapp" }) {
  const existing = await prisma.ticket.findFirst({
    where: { leadId, status: "aberto" },
    orderBy: { abertoEm: "desc" },
  });
  if (existing) return { ticket: existing, isNew: false };
  const ticket = await prisma.ticket.create({
    data: { leadId, canal, status: "aberto" },
  });
  return { ticket, isNew: true };
}

// Encerra todos os tickets abertos do lead (distribuição nova em aberto).
export async function closeOpenTickets({ leadId, atendenteId }) {
  await prisma.ticket.updateMany({
    where: { leadId, status: "aberto" },
    data: {
      status: "finalizado",
      finalizadoEm: new Date(),
      ...(atendenteId ? { atendenteId } : {}),
    },
  });
}

// Reabre a conversa quando um contato finalizado volta a falar: cria NOVO
// ticket aberto e devolve o lead ao fluxo de atendimento (menu de boas-vindas).
// Não toca statusPipeline (a reabertura do status é feita pelo chamador).
export async function reopenLeadWithNewTicket({ leadId, canal = "whatsapp" }) {
  const ticket = await prisma.ticket.create({
    data: { leadId, canal, status: "aberto" },
  });
  console.log(`[tickets] novo ticket #${ticket.numero} lead=${leadId} (reaberto)`);
  return ticket;
}

// Reabre UM LEAD finalizado: zera dataArquivamento/status, devolve pra fila,
// limpa estado de menu/fila/handoff antigo e abre um NOVO ticket. Retorna o
// lead atualizado (para o menu reiniciar as boas-vindas).
export async function reopenFinalizedLead({ lead, canal = "whatsapp" }) {
  const meta = lead.metadata && typeof lead.metadata === "object" ? { ...lead.metadata } : {};
  delete meta.menu;
  delete meta.fila;
  delete meta.handoffPendenteDesde;

  const tags = Array.isArray(lead.tags) ? lead.tags.filter((t) => t && !String(t).startsWith("fila-")) : [];
  if (!tags.includes("reativado")) tags.push("reativado");

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      statusPipeline: "novo",
      biaAtiva: true,
      atendenteId: null,
      dataArquivamento: null,
      dataPerda: null,
      metadata: meta,
      tags,
    },
  });

  // Limpa qualquer alocação de fila antiga — o novo ticket começa do zero.
  await prisma.queueAssignment.deleteMany({ where: { leadId: lead.id } });

  await reopenLeadWithNewTicket({ leadId: lead.id, canal });
  console.log(`[tickets] lead reaberto lead=${lead.id} "${lead.nome || ""}"`);
  return updated;
}