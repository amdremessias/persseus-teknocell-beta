// ── WAHA (WhatsApp HTTP API) — parser de webhooks ────────────────────────────
// Formato do envelope: { event, session, me, payload, engine }
//  - event "message":       { id, timestamp, from, fromMe, source, to, body, hasMedia, media }
//  - event "session.status":{ status: STARTING|SCAN_QR_CODE|WORKING|FAILED|... , statuses, data }
// Documentação: https://waha.devlike.pro/docs/how-to/events/

// Conversa 1:1 "5511999999999@c.us" ou "12345@lid" (formato LID do WhatsApp).
// Ignora grupos/canais (@g.us, @newsletter...) e status.
function isDirectChat(chatId) {
  return typeof chatId === 'string' && (chatId.endsWith('@c.us') || chatId.endsWith('@lid'));
}

// Normaliza pro mesmo formato que o MercadoPhone grava (número puro, sem @c.us)
export function normalizeWahaIdentifier(chatId) {
  if (!chatId) return null;
  const clean = String(chatId).replace(/@.*$/, '').replace(/[^\d]/g, '');
  return clean || null;
}

// id de envio: contactos LID NÃO têm número de telefone exposto — usa o próprio
// "12345@lid" pra responder no chat certo. @c.us mantém número puro (compat e
// único com o resto do sistema).
export function wahaIdentifierForReply(chatId) {
  if (!chatId) return null;
  const s = String(chatId);
  if (s.endsWith('@lid')) return s;
  return normalizeWahaIdentifier(s);
}

function extractContactName(payload) {
  for (const key of ['senderName', 'chatName', 'notifyName']) {
    if (payload?.[key] && typeof payload[key] === 'string' && payload[key].trim()) return payload[key].trim();
  }
  if (payload?.chat?.pushname) return payload.chat.pushname;
  if (payload?.chat?.name) return payload.chat.name;
  if (payload?._data?.notifyName) return String(payload._data.notifyName);
  if (payload?._data?.contact?.name) return String(payload._data.contact.name);
  return null;
}

function extractMedia(payload) {
  if (payload?.media && typeof payload.media === 'object' && typeof payload.media.url === 'string') {
    return { url: payload.media.url, mimetype: payload.media.mimetype ?? null, filename: payload.media.filename ?? null };
  }
  return null;
}

export function parseWahaWebhook(body) {
  const event = body?.event;
  const session = body?.session ?? 'default';
  const payload = body?.payload ?? {};

  // Sessão: QR / logado / deslogado — diagnóstico (não vira mensagem)
  if (event === 'session.status') {
    const status = payload.status ?? 'UNKNOWN';
    return {
      kind: 'waha_session',
      session,
      status,
      me: body?.me ?? null,
      reachoutTimelock: payload?.data?.reachoutTimelock ?? null,
    };
  }

  if (event !== 'message' && event !== 'message.any') {
    return { kind: 'unknown', rawEvent: event, body };
  }

  // Só atendemos conversas 1:1 — grupos/canais não entram no CRM por aqui.
  const counterpart = payload.fromMe ? payload.to : payload.from;
  if (!isDirectChat(counterpart)) {
    return { kind: 'waha_group_skipped', chatId: counterpart ?? null };
  }

  const identifier = normalizeWahaIdentifier(counterpart);
  if (!identifier) {
    return { kind: 'unknown', reason: 'no_identifier', rawEvent: event, body };
  }

  const contactName = extractContactName(payload) || identifier;
  const media = extractMedia(payload);
  const externalMessageId = payload.id ?? null;
  const fromMe = Boolean(payload.fromMe);

  const leadIdentifier = wahaIdentifierForReply(counterpart);

  // fromMe=true: eco do que enviamos. source="app" → atendente digitou no celular;
  // source="api" → enviado via API (CRM/BIA). Idêntico ao eco do MercadoPhone.
  if (fromMe) {
    return {
      kind: 'echo',
      isHumanAttendantOnWaha: payload.source === 'app',
      session,
      lead: { identifier: leadIdentifier, contactName, detectedCanal: 'whatsapp', wahaSession: session },
      message: {
        externalMessageId,
        text: typeof payload.body === 'string' ? payload.body : null,
        mediaUrl: media?.url ?? null,
        tipo: payload.source === 'app' ? 'atendente' : 'bia_echo',
      },
    };
  }

  return {
    kind: 'incoming',
    session,
    lead: { identifier: leadIdentifier, contactName, detectedCanal: 'whatsapp', wahaSession: session },
    message: {
      externalMessageId,
      text: typeof payload.body === 'string' ? payload.body : null,
      mediaUrl: media?.url ?? null,
      tipo: 'cliente',
    },
  };
}