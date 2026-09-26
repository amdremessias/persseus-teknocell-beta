import prisma from '../lib/prisma.js';
import { fireWebhook } from './webhooks.js';
import { closeOpenTickets } from './tickets.js';
import { clearHandoffPendente } from './handoffWatch.js';

// Aplica o efeito da finalização "convertido" a um lead: mesma mudança de status
// + emit + webhook que a rota POST /leads/:id/status já faz hoje. Fonte única da
// regra, reusada pelo registro de venda (POST /leads/:id/venda).
// Também encerra o ticket em aberto (protocolo) e encerra o re-alerta de handoff.
export async function finalizeConvertido(fastify, leadId) {
  const before = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { atendenteId: true },
  });

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { statusPipeline: 'convertido', biaAtiva: false },
  });

  await closeOpenTickets({ leadId, atendenteId: before?.atendenteId ?? null });
  clearHandoffPendente(leadId).catch(() => {});

  fastify.io?.emit('lead:updated', lead);
  await fireWebhook('lead.status_changed', { leadId: lead.id, status: 'convertido' });
  return lead;
}