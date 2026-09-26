import { ChannelAdapter } from '../base.js';
import { parseWhatsAppWebhook } from './parser.js';
import { parseWahaWebhook } from './waha-parser.js';
import { sendWhatsAppMessage } from './sender.js';

// WAHA envelopa tudo em { event, session, me, payload, ... } — MercadoPhone não tem esse shape.
export function isWahaPayload(body) {
  return !!body && typeof body === 'object'
    && typeof body.event === 'string'
    && typeof body.session === 'string'
    && body.payload && typeof body.payload === 'object';
}

export class WhatsAppAdapter extends ChannelAdapter {
  get canal() { return 'whatsapp'; }

  parseWebhook(rawPayload) {
    if (isWahaPayload(rawPayload)) return parseWahaWebhook(rawPayload);
    return parseWhatsAppWebhook(rawPayload);
  }

  async sendMessage({ identifier, texto, mediaUrl }) {
    return sendWhatsAppMessage({ identifier, texto, mediaUrl });
  }
}
