import { getSetting } from '../../lib/settings-cache.js';

function mediaKind(url) {
  const ext = String(url || '').split('?')[0].split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (['mp4', '3gp'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'aac', 'ogg', 'opus'].includes(ext)) return 'audio';
  return 'document';
}

function absoluteMediaUrl(url) {
  if (/^https:\/\//i.test(String(url || ''))) return String(url);
  if (/^http:\/\//i.test(String(url || ''))) return '';
  const base = String(getSetting('FRONTEND_URL') || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!/^https:\/\//i.test(base)) return '';
  return base && url ? base + (String(url).startsWith('/') ? '' : '/') + url : '';
}

export async function sendMetaCloudMessage({ identifier, texto, mediaUrl }) {
  const phoneNumberId = getSetting('META_WA_PHONE_NUMBER_ID');
  const accessToken = getSetting('META_WA_ACCESS_TOKEN');
  if (!phoneNumberId || !accessToken) return { success: false, error: 'Credenciais da WhatsApp Cloud API incompletas' };
  const to = String(identifier || '').replace(/\D/g, '');
  if (!to) return { success: false, error: 'Número de destino inválido' };

  const message = { messaging_product: 'whatsapp', to };
  if (mediaUrl) {
    const link = absoluteMediaUrl(mediaUrl);
    if (!link) return { success: false, error: 'Mídia precisa ter uma URL pública para a Meta' };
    const type = mediaKind(link);
    message.type = type;
    message[type] = { link, ...(['image', 'video', 'document'].includes(type) && texto ? { caption: texto } : {}) };
  } else {
    message.type = 'text';
    message.text = { body: String(texto || '') };
  }

  const version = String(getSetting('META_WA_GRAPH_VERSION', 'v20.0')).replace(/^v?/, 'v');
  try {
    const res = await fetch('https://graph.facebook.com/' + version + '/' + phoneNumberId + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[whatsapp:meta] envio falhou HTTP ' + res.status);
      return { success: false, error: 'Meta Cloud API HTTP ' + res.status };
    }
    return { success: true, externalMessageId: data?.messages?.[0]?.id || null };
  } catch (err) {
    console.error('[whatsapp:meta] falha de rede:', err.message);
    return { success: false, error: err.message };
  }
}
