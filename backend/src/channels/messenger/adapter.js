import { ChannelAdapter } from '../base.js';
import { parseMessengerWebhook } from './parser.js';
import { sendMessengerMessage } from './sender.js';

// TODO: ativar quando META_MESSENGER_TOKEN estiver em ChannelConfig (canal: messenger)
export class MessengerAdapter extends ChannelAdapter {
  get canal() { return 'messenger'; }

  parseWebhook(rawPayload) {
    return parseMessengerWebhook(rawPayload);
  }

  async sendMessage({ identifier, texto, mediaUrl }) {
    return sendMessengerMessage({ identifier, texto, mediaUrl });
  }
}
