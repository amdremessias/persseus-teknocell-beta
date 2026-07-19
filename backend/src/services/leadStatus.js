import prisma from '../lib/prisma.js';
import { fireWebhook } from './webhooks.js';

// Aplica o efeito da finalização "convertido" a um lead: mesma mudança de status
// + emit + webhook que a rota POST /leads/:id/status já faz hoje. Fonte única da
// regra, reusada pelo registro de venda (POST /leads/:id/venda).
export async function finalizeConvertido(fastify, leadId) {
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { statusPipeline: 'convertido' },
  });
  fastify.io?.emit('lead:updated', lead);
  await fireWebhook('lead.status_changed', { leadId: lead.id, status: 'convertido' });
  return lead;
}
