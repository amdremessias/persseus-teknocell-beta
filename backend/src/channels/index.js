import { WhatsAppAdapter } from './whatsapp/adapter.js';
import { InstagramAdapter } from './instagram/adapter.js';
import { MessengerAdapter } from './messenger/adapter.js';
import { TikTokAdapter } from './tiktok/adapter.js';

const registry = {
  whatsapp: new WhatsAppAdapter(),
  instagram: new InstagramAdapter(),
  messenger: new MessengerAdapter(),
  tiktok: new TikTokAdapter(),
};

export function getAdapter(canal) {
  const adapter = registry[canal];
  if (!adapter) throw new Error(`[channels] adapter não encontrado para canal: ${canal}`);
  return adapter;
}
