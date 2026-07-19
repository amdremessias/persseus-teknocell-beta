import { ChannelAdapter } from '../base.js';
import { parseWhatsAppWebhook } from './parser.js';
import { sendWhatsAppMessage } from './sender.js';

export class WhatsAppAdapter extends ChannelAdapter {
  get canal() { return 'whatsapp'; }

  parseWebhook(rawPayload) {
    return parseWhatsAppWebhook(rawPayload);
  }

  async sendMessage({ identifier, texto, mediaUrl }) {
    return sendWhatsAppMessage({ identifier, texto, mediaUrl });
  }
}
