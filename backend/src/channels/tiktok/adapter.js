import { ChannelAdapter } from '../base.js';
import { parseTikTokWebhook } from './parser.js';
import { sendTikTokMessage } from './sender.js';

// TODO: ativar quando TIKTOK_TOKEN estiver em ChannelConfig (canal: tiktok)
export class TikTokAdapter extends ChannelAdapter {
  get canal() { return 'tiktok'; }

  parseWebhook(rawPayload) {
    return parseTikTokWebhook(rawPayload);
  }

  async sendMessage({ identifier, texto, mediaUrl }) {
    return sendTikTokMessage({ identifier, texto, mediaUrl });
  }
}
