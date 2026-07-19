import { ChannelAdapter } from '../base.js';
import { parseInstagramWebhook } from './parser.js';
import { sendInstagramMessage } from './sender.js';

export class InstagramAdapter extends ChannelAdapter {
  get canal() { return 'instagram'; }

  parseWebhook(rawPayload) {
    return parseInstagramWebhook(rawPayload);
  }

  async sendMessage({ identifier, texto, mediaUrl }) {
    return sendInstagramMessage({ identifier, texto, mediaUrl });
  }
}
