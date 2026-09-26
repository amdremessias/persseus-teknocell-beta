// ── WAHA (WhatsApp HTTP API) — client REST ───────────────────────────────────
// Sessões: path param /api/{session}/...  Autenticação: header X-Api-Key.
// Docs: https://waha.devlike.pro/docs/how-to/send-messages/
import { getSetting } from '../../lib/settings-cache.js';
import { normalizeWahaIdentifier } from './waha-parser.js';

function wahaBase() {
  return (getSetting('WAHA_URL') || '').replace(/\/+$/, '');
}

function wahaSession() {
  return getSetting('WAHA_SESSION', 'default');
}

function wahaHeaders(json) {
  const headers = { Accept: 'application/json' };
  if (json) headers['Content-Type'] = 'application/json';
  const key = getSetting('WAHA_API_KEY');
  if (key) headers['X-Api-Key'] = key;
  return headers;
}

// identifier → chatId brando às mensagens 1:1 do WhatsApp
function buildChatId(identifier) {
  if (!identifier) return null;
  const id = String(identifier);
  if (id.includes('@')) return id;
  return `${id}@c.us`;
}

async function wahaRequest(path, body, timeoutMs = 15000) {
  const base = wahaBase();
  if (!base) return { success: false, error: 'WAHA_URL não configurado' };
  if (!getSetting('WAHA_API_KEY')) {
    return { success: false, error: 'WAHA_API_KEY não configurado' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: wahaHeaders(true),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[waha:api] HTTP ${res.status} em ${path}:`, JSON.stringify(data).slice(0, 300));
      return { success: false, error: `HTTP ${res.status}` };
    }
    return { success: true, data };
  } catch (err) {
    console.error(`[waha:api] erro em ${path}:`, err.message);
    return { success: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Tenta uma lista de paths (ex.: /api/{session}/sendText e, em 404, /api/sendText).
async function wahaRequestFirst(paths, body) {
  let lastError = null;
  for (const path of paths) {
    const r = await wahaRequest(path, body);
    if (r.success) return r;
    lastError = r;
    if (r.error !== 'HTTP 404') return r; // só cai pro alternativo em rota inexistente
  }
  return lastError;
}

// Normaliza o id de resposta do WAHA (sempre string; objetos viram JSON string)
function toMessageId(v) {
  if (v == null) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export async function sendWahaText({ identifier, texto }) {
  const chatId = buildChatId(identifier);
  const session = wahaSession();
  if (!chatId) return { success: false, error: 'identifier inválido' };

  // Versões novas do WAHA expõem /api/sendText (sem sessão; nome vai no body);
  // as clássicas usam /api/{session}/sendText. Tenta com sessão e cai pra sem sessão em 404.
  const r = await wahaRequestFirst(
    [`/api/${session}/sendText`, '/api/sendText'],
    { chatId, text: texto ?? '', session }
  );
  if (!r.success) return r;

  const externalMessageId = toMessageId(r.data?.messageId || r.data?.id || null);
  console.log(`[waha:send] ok → ${chatId} mid=${externalMessageId}`);
  return { success: true, externalMessageId };
}

export async function sendWahaMedia({ identifier, texto, mediaUrl }) {
  const chatId = buildChatId(identifier);
  const session = wahaSession();
  if (!chatId) return { success: false, error: 'identifier inválido' };

  // mediaUrl costuma ser caminho interno (/api/uploads/x). Converte pra URL
  // alcançável pelo container do WAHA (compõe com INTERNAL_API_URL).
  let fileUrl = String(mediaUrl ?? '');
  if (/^\/api\//.test(fileUrl)) {
    const base = (getSetting('INTERNAL_API_URL') || 'http://backend:3001').replace(/\/+$/, '');
    fileUrl = `${base}${fileUrl}`;
  }
  if (!/^https?:\/\//.test(fileUrl)) {
    return { success: false, error: `mediaUrl inválida: ${mediaUrl}` };
  }

  const r = await wahaRequestFirst(
    [`/api/${session}/sendFile`, '/api/sendFile'],
    {
      chatId,
      session,
      file: { url: fileUrl, caption: texto ?? '' },
    }
  );
  if (!r.success) return r;

  const externalMessageId = toMessageId(r.data?.messageId || r.data?.id || null);
  console.log(`[waha:send] mídia ok → ${chatId} mid=${externalMessageId}`);
  return { success: true, externalMessageId };
}

export function wahaChatIdFor(identifier) {
  return buildChatId(identifier);
}

export { normalizeWahaIdentifier as wahaNumberOnly }; // re-export útil p/ endpoints