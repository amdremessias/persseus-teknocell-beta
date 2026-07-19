import prisma from '../lib/prisma.js';
import { getAdapter } from '../channels/index.js';
import {
  mercadophoneSendTextViaTicket,
  mercadophoneSendMediaViaTicket,
} from '../channels/whatsapp/mercadophone-api.js';

let _io = null;

export function setupOutbound(io) {
  _io = io;
}

export async function sendToCustomer(leadId, texto, mediaUrl = null) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`[outbound] Lead não encontrado: ${leadId}`);

  const { canal, identifierCanal } = lead;
  if (!identifierCanal) throw new Error(`[outbound] Lead sem identifierCanal: ${leadId}`);

  let result;
  // Non-WhatsApp leads delivered via MercadoPhone (e.g. Instagram): route via hub-message ticket
  if (canal !== 'whatsapp' && lead.mercadophoneTicketUuid) {
    const ticketId = lead.mercadophoneTicketUuid;
    try {
      if (mediaUrl) {
        await mercadophoneSendMediaViaTicket({ ticketId, mediaPublicPath: mediaUrl, caption: texto || '' });
        result = { success: true, externalMessageId: null };
      } else {
        result = await mercadophoneSendTextViaTicket({ ticketId, text: texto });
      }
    } catch (err) {
      console.error(`[outbound] hub-message ticket error (${canal}/${ticketId}):`, err.message);
      result = { success: false, error: err.message };
    }
  } else {
    const adapter = getAdapter(canal);
    result = await adapter.sendMessage({ identifier: identifierCanal, texto, mediaUrl });
  }

  const message = await prisma.message.create({
    data: {
      leadId,
      tipo: 'bia',
      texto: texto || '',
      canal,
      deliveryStatus: result.success ? 'sent' : 'failed',
      ...(result.externalMessageId ? { externalMessageId: result.externalMessageId } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
    },
  });

  await prisma.lead.update({ where: { id: leadId }, data: { atualizadoEm: new Date() } });

  if (_io) {
    _io.to(`lead:${leadId}`).emit('message:new', message);
  }

  if (!result.success) {
    console.error(`[outbound] falha ao enviar para ${canal}/${identifierCanal}:`, result.error);
  }

  return { message, delivery: result };
}
