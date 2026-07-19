import { getSetting } from '../../lib/settings-cache.js';

export async function sendWhatsAppMessage({ identifier, texto, mediaUrl }) {
  const url = getSetting('MERCADOPHONE_URL', 'https://exclusivoapi.mercadophone.tech/api/messages/sendOfficialData');
  const token = getSetting('MERCADOPHONE_TOKEN');
  if (!token) {
    console.warn('[whatsapp:sender] MERCADOPHONE_TOKEN não configurado');
    return { success: false, error: 'MERCADOPHONE_TOKEN não configurado' };
  }

  const body = mediaUrl
    ? { number: identifier, mediaUrl, caption: texto || '' }
    : { number: identifier, text: texto };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[whatsapp:sender] falha HTTP ${res.status}:`, data);
      return { success: false, error: `HTTP ${res.status}` };
    }

    // MercadoPhone retorna { response: { wid, id, ... }, ticket: {...} }
    const externalMessageId = data?.response?.wid || data?.wid || data?.id || data?.messageId || null;
    console.log(`[whatsapp:sender] ok → wid=${externalMessageId}`);
    return { success: true, externalMessageId };
  } catch (err) {
    console.error('[whatsapp:sender] erro:', err.message);
    return { success: false, error: err.message };
  }
}
