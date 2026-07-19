import { readFile } from 'fs/promises';
import path from 'path';
import { getSetting } from '../../lib/settings-cache.js';

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';

const MIME_MAP = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mp3',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const DEFAULT_BASE_URL = 'https://exclusivoapi.mercadophone.tech';

function getJwt() {
  const jwt = getSetting('MERCADOPHONE_JWT');
  if (!jwt) throw new Error('MERCADOPHONE_JWT não configurado');
  return jwt;
}

function getAuthHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getJwt()}` };
}

function getJwtAuthHeader() {
  return { Authorization: `Bearer ${getJwt()}` };
}

function apiUrl(path) {
  const base = getSetting('MERCADOPHONE_API_URL', DEFAULT_BASE_URL);
  return `${base}${path}`;
}

export async function mercadophoneContactByNumber(number) {
  console.log(`[mercadophone:contact] buscando número ${number}`);
  const res = await fetch(apiUrl(`/contacts/nt?searchParam=${encodeURIComponent(number)}`), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error(`[mercadophone:contact] GET falhou HTTP ${res.status}:`, data);
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  const contacts = data?.contacts ?? [];
  if (contacts.length > 0) {
    console.log(`[mercadophone:contact] encontrado id=${contacts[0].id}`);
    return contacts[0];
  }
  return null;
}

export async function mercadophoneCreateContact({ name, number }) {
  console.log(`[mercadophone:contact] criando contato name="${name}" number=${number}`);
  const res = await fetch(apiUrl('/contacts'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name,
      number,
      email: '',
      lid: '',
      altnumber: '',
      senderPn: '',
      carteiraId: [],
      disableBot: false,
      compartilhado: false,
      cpfcnpj: '',
      genero: '',
      estado: '',
      cidade: '',
      referencia: '',
      aniversario: '',
      endereco: '',
      promptId: '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    console.log('[mercadophone:contact] 409 — contato já existe, buscando via GET');
    return mercadophoneContactByNumber(number);
  }
  if (!res.ok) {
    console.error(`[mercadophone:contact] POST falhou HTTP ${res.status}:`, data);
    throw new Error(`HTTP ${res.status}`);
  }
  console.log(`[mercadophone:contact] criado id=${data.id}`);
  return data;
}

export async function mercadophoneFindOrCreateContact({ name, number }) {
  const existing = await mercadophoneContactByNumber(number);
  if (existing) return existing;
  return mercadophoneCreateContact({ name, number });
}

export async function mercadophoneFindOpenTicket({ contactId }) {
  const res = await fetch(apiUrl(`/tickets?contactId=${contactId}&status=open&pageNumber=1`), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const tickets = data?.tickets ?? (Array.isArray(data) ? data : []);
  if (tickets.length > 0) {
    console.log(`[mercadophone:ticket] ticket aberto encontrado id=${tickets[0].id}`);
    return tickets[0];
  }
  return null;
}

// Abre um ticket sem template (necessário para habilitar envio de mídia via hub-message)
export async function mercadophoneOpenTicket({ contactId }) {
  const whatsappId = parseInt(getSetting('MERCADOPHONE_WHATSAPP_ID', '185'), 10);
  const queueId    = parseInt(getSetting('MERCADOPHONE_QUEUE_ID', '85'), 10);
  const userId     = parseInt(getSetting('MERCADOPHONE_USER_ID', '161'), 10);

  const payload = { contactId, queueId, whatsappId, userId, status: 'open' };

  console.log(`[mercadophone:ticket] abrindo ticket (sem template) contactId=${contactId}`);
  const res = await fetch(apiUrl('/tickets'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[mercadophone:ticket] POST falhou HTTP ${res.status}:`, data);
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  console.log(`[mercadophone:ticket] ticket aberto id=${data.id}`);
  return data;
}

export async function mercadophoneReopenTicket(ticketId) {
  console.log(`[mercadophone:ticket] reabrindo ticket id=${ticketId} (status pending→open)`);
  const res = await fetch(apiUrl(`/tickets/${ticketId}`), {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status: 'open' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[mercadophone:ticket] PUT reopen falhou HTTP ${res.status}:`, data);
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  console.log(`[mercadophone:ticket] ticket id=${ticketId} reaberto`);
  return data;
}

// Envia mensagem de TEXTO pelo canal do ticket (funciona para WhatsApp e Instagram)
export async function mercadophoneSendTextViaTicket({ ticketId, text }) {
  const form = new FormData();
  form.append('body', text);
  form.append('fromMe', 'true');

  const endpoint = apiUrl(`/hub-message/${ticketId}`);
  console.log(`[mercadophone:ticket] POST hub-message text ticketId=${ticketId}`);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: getJwtAuthHeader(),
    body: form,
  });
  const responseText = await res.text();
  console.log(`[mercadophone:ticket] hub-message text status=${res.status} body=${responseText.slice(0, 200)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${responseText}`);
  try {
    const data = JSON.parse(responseText);
    return { success: true, externalMessageId: data?.id || data?.messageId || null };
  } catch {
    return { success: true, externalMessageId: null };
  }
}

export async function mercadophoneSendMediaViaTicket({ ticketId, mediaPublicPath, caption = '' }) {
  // mediaPublicPath ex: /api/uploads/1234567890.ogg
  const filename = path.basename(mediaPublicPath);
  const diskPath = path.join(UPLOADS_DIR, filename);
  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME_MAP[ext] || 'application/octet-stream';

  console.log(`[outgoing] lendo arquivo do disco: ${diskPath}`);
  const fileBuffer = await readFile(diskPath);

  const form = new FormData();
  form.append('medias', new Blob([fileBuffer], { type: mimeType }), filename);
  form.append('body', caption || filename);
  form.append('fromMe', 'true');

  const endpoint = apiUrl(`/hub-message/${ticketId}`);
  console.log(`[outgoing] POST hub-message ${endpoint} (${filename}, ${mimeType}, ${fileBuffer.length} bytes)`);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: getJwtAuthHeader(),
    body: form,
  });
  const responseText = await res.text();
  console.log(`[outgoing] hub-message status=${res.status} body=${responseText.slice(0, 300)}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${responseText}`);
  }
  return responseText;
}

// ── Sync de mensagens (rede de segurança / backfill de histórico) ─────────────

// Retorna o ticket mais recente do contato (aberto OU fechado). Usado pelo job
// de sync quando o lead ainda não tem ticketId conhecido.
export async function mercadophoneLatestTicketByContact({ contactId }) {
  // 1) tenta ticket aberto (rota já existente e barata)
  const open = await mercadophoneFindOpenTicket({ contactId });
  if (open) return open;

  // 2) fallback: lista tickets do contato sem filtro de status, pega o 1º (mais recente)
  const res = await fetch(apiUrl(`/tickets?contactId=${contactId}&pageNumber=1`), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const tickets = data?.tickets ?? (Array.isArray(data) ? data : []);
  if (tickets.length > 0) {
    console.log(`[mercadophone:ticket] ticket recente (qualquer status) id=${tickets[0].id}`);
    return tickets[0];
  }
  return null;
}

// Busca mensagens de um ticket (padrão Whaticket: GET /messages/:ticketId?pageNumber=N).
// Retorna o objeto bruto da API — o parsing fica no serviço de sync.
export async function mercadophoneGetTicketMessages({ ticketId, pageNumber = 1 }) {
  const res = await fetch(apiUrl(`/messages/${ticketId}?pageNumber=${pageNumber}`), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── WABA templates (listagem dos templates aprovados na Meta) ─────────────────

let _templatesCache = { at: 0, data: null };
const TEMPLATES_TTL_MS = 5 * 60 * 1000; // 5 min
let _loggedTemplatesRaw = false;

function safeParseComponents(components) {
  if (Array.isArray(components)) return components;
  if (typeof components === 'string') {
    try { return JSON.parse(components); } catch { return []; }
  }
  return [];
}

// Normaliza um template da API pro shape usado no envio de templates aprovados.
export function normalizeTemplate(t) {
  return {
    name: t.name,
    id: t.id ?? t.template_id ?? t.metaId ?? null,
    parameter_format: t.parameter_format ?? 'POSITIONAL',
    language: t.language ?? 'pt_BR',
    category: t.category ?? 'UTILITY',
    status: t.status ?? 'APPROVED',
    disable_ios_autofill: t.disable_ios_autofill ?? false,
    is_primary_device_delivery_only: t.is_primary_device_delivery_only ?? false,
    headerMediaUrl: t.headerMediaUrl ?? null,
    components: safeParseComponents(t.components),
  };
}

// Texto do componente BODY do template.
export function templateBodyText(components) {
  const comps = safeParseComponents(components);
  const body = comps.find((c) => String(c?.type ?? '').toUpperCase() === 'BODY');
  return body?.text ?? '';
}

// Renderiza o BODY do template substituindo {{n}} pelos valores (pro histórico).
export function renderTemplateBody(template, variables) {
  return templateBodyText(template.components).replace(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
    (_, k) => variables?.[k] ?? `{{${k}}}`
  );
}

const GRAPH_VERSION = 'v20.0';

// O MercadoPhone (Whaticket-like) não expõe rota de listagem de templates, mas o
// objeto /whatsapp/:id guarda as credenciais Meta (metaWabaId + metaAccessToken).
// Buscamos a lista direto da fonte da verdade (Meta Graph message_templates).
async function fetchMetaCredentials() {
  const whatsappId = getSetting('MERCADOPHONE_WHATSAPP_ID', '185');
  const res = await fetch(apiUrl(`/whatsapp/${whatsappId}`), { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET /whatsapp/${whatsappId} HTTP ${res.status}`);
  const w = await res.json();
  return {
    wabaId: w?.metaWabaId || null,
    token: w?.metaAccessToken || null,
    phoneNumberId: w?.metaPhoneNumberId || null,
  };
}

// Lista templates aprovados/pendentes da conta WABA (Meta Graph).
// Cache em memória de 5 min. Loga o 1º template no primeiro uso (formato).
export async function mercadophoneListTemplates({ force = false } = {}) {
  const now = Date.now();
  if (!force && _templatesCache.data && now - _templatesCache.at < TEMPLATES_TTL_MS) {
    return _templatesCache.data;
  }

  try {
    const { wabaId, token } = await fetchMetaCredentials();
    if (!wabaId || !token) {
      console.error('[mercadophone:templates] credenciais Meta ausentes na conexão whatsapp');
      return _templatesCache.data || [];
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?limit=200&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data?.data)) {
      console.error(`[mercadophone:templates] Graph falhou HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
      return _templatesCache.data || [];
    }

    if (!_loggedTemplatesRaw) {
      console.log(`[mercadophone:templates] resposta bruta (Graph, 1º item): ${JSON.stringify(data.data[0] ?? {}).slice(0, 600)}`);
      _loggedTemplatesRaw = true;
    }

    _templatesCache = { at: now, data: data.data };
    return data.data;
  } catch (err) {
    console.error('[mercadophone:templates] erro ao listar:', err.message);
    return _templatesCache.data || [];
  }
}

// Monta os components do envio a partir do template + variáveis. Só inclui BODY
// com parâmetros quando o template REALMENTE tem {{n}}; respeita parameter_format
// (POSITIONAL → {type:text,text} em ordem numérica; NAMED → +parameter_name).
function buildTemplateComponents(template, variables) {
  const bodyText = templateBodyText(template.components);
  const keys = [...String(bodyText).matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((mm) => mm[1]);
  let uniq = [...new Set(keys)];
  if (uniq.length === 0) return []; // sem variáveis → sem parâmetros (corrige #132000/#132012)

  const format = String(template.parameter_format || 'POSITIONAL').toUpperCase();
  if (format !== 'NAMED') uniq = uniq.sort((a, b) => Number(a) - Number(b));

  const parameters = uniq.map((key) =>
    format === 'NAMED'
      ? { type: 'text', parameter_name: key, text: String(variables?.[key] ?? '') }
      : { type: 'text', text: String(variables?.[key] ?? '') }
  );
  return [{ type: 'body', parameters }];
}

// Envia um template aprovado DIRETO pela Meta Graph (o /tickets do MercadoPhone não
// respeita 0 variáveis / parameter_format). Retorna o wid da mensagem, ou lança erro.
export async function mercadophoneSendTemplateByName({ to, template, variables = {} }) {
  const { phoneNumberId, token } = await fetchMetaCredentials();
  if (!phoneNumberId || !token) throw new Error('credenciais Meta ausentes');

  const components = buildTemplateComponents(template, variables);
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language || 'pt_BR' },
      ...(components.length ? { components } : {}),
    },
  };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta ${res.status}: ${JSON.stringify(data?.error ?? data).slice(0, 200)}`);
  }
  return data?.messages?.[0]?.id ?? null;
}

// Resolve um template APROVADO pelo nome, já no shape normalizado de template.
// Retorna null se não existir ou não estiver aprovado.
export async function mercadophoneGetApprovedTemplateByName(name) {
  if (!name) return null;
  let list;
  try {
    list = await mercadophoneListTemplates();
  } catch (err) {
    console.error('[mercadophone:templates] erro ao listar:', err.message);
    return null;
  }
  const found = list.find(
    (t) => t?.name === name && String(t?.status ?? '').toUpperCase() === 'APPROVED'
  );
  return found ? normalizeTemplate(found) : null;
}
