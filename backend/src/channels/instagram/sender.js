import { getSetting } from '../../lib/settings-cache.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';

export async function sendInstagramMessage({ identifier, texto, mediaUrl }) {
  const token = getSetting('META_GRAPH_TOKEN');
  if (!token) {
    console.warn('[instagram:sender] META_GRAPH_TOKEN não configurado — adicione em /settings/integracoes');
    return { success: false, error: 'Instagram não configurado — preencha META_GRAPH_TOKEN em /settings/integracoes' };
  }

  const message = mediaUrl
    ? { attachment: { type: 'image', payload: { url: mediaUrl, is_reusable: true } } }
    : { text: texto };

  try {
    const res = await fetch(`${META_GRAPH_BASE}/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: identifier }, message }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[instagram:sender] falha HTTP ${res.status}:`, data);
      return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
    }

    return { success: true, externalMessageId: data?.message_id || null };
  } catch (err) {
    console.error('[instagram:sender] erro:', err.message);
    return { success: false, error: err.message };
  }
}
