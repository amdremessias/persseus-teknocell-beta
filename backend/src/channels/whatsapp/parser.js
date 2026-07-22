// ── Click-to-WhatsApp ad referral detection ──────────────────────────────────
// Meta injeta um objeto `referral` na PRIMEIRA mensagem de quem clicou num
// anúncio CTWA. Confirmado nos logs de produção que o MercadoPhone expõe:
//   • `referral` no topo do payload (null quando a msg não veio de anúncio);
//   • `ticketData.fromAds` — marcador de anúncio persistente no ticket.
// Varremos o payload inteiro (busca profunda, case-insensitive) por qualquer
// sinal de referral/ctwa/source_id/ad_id — inclusive dentro de strings JSON
// aninhadas (mensagem.dataJson, às vezes duplo-encodada, onde a Meta enfia o
// referral no anúncio real). Playbook defensivo: referral real → captura + loga.
const REFERRAL_SIGNAL_RE = /referral|ctwa|source_?id|ad_?id/i;

// Busca o objeto referral em qualquer nível. Confirmado nos logs: o MercadoPhone
// expõe `referral` no topo (null quando não é anúncio) e, no anúncio real, a Meta
// também o enfia em `mensagem.dataJson` (JSON às vezes duplo-encodado). Captura
// apenas objetos referral REAIS — `referral:null` (padrão em toda msg) é ignorado.
function scanForReferral(node, depth, acc) {
  // Limite alto de profundidade: o referral da Meta fica ~12 níveis fundo dentro
  // do dataJson (rawData.entry[].changes[].value.messages[].referral).
  if (node == null || depth > 20 || acc.referral) return;
  if (typeof node === 'string') {
    // Só tenta desserializar quando há sinal — evita parsear toda string à toa.
    // dataJson vem duplo/triplo-encodado (string dentro de string) — desembrulha
    // até virar objeto, sem custar profundidade extra por camada de encoding.
    if (node.length > 8 && REFERRAL_SIGNAL_RE.test(node)) {
      let val = node;
      for (let i = 0; i < 4 && typeof val === 'string'; i++) {
        try { val = JSON.parse(val); } catch { val = null; break; }
      }
      if (val && typeof val === 'object') scanForReferral(val, depth + 1, acc);
    }
    return;
  }
  if (typeof node !== 'object') return;
  for (const [key, val] of Object.entries(node)) {
    if (acc.referral == null && REFERRAL_SIGNAL_RE.test(key)) {
      if (/^referral$/i.test(key) && val && typeof val === 'object' && !Array.isArray(val)) {
        acc.referral = val;
      } else if (/source_?id|ctwa_clid/i.test(key) && val != null && val !== '') {
        // nó que carrega source_id/ctwa_clid é provavelmente o próprio referral
        acc.referral = node;
      }
    }
    scanForReferral(val, depth + 1, acc);
  }
}

function normalizeReferral(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const pick = (...keys) => {
    for (const k of keys) if (ref[k] != null && ref[k] !== '') return ref[k];
    return null;
  };
  const source_id   = pick('source_id', 'sourceId', 'ad_id', 'adId');
  const source_type = pick('source_type', 'sourceType');
  const ctwa_clid   = pick('ctwa_clid', 'ctwaClid');
  // Só tratamos como referral de anúncio se houver âncora real (id do anúncio,
  // clid do clique, ou type=ad). Evita falso-positivo de chave solta.
  if (!source_id && !ctwa_clid && source_type !== 'ad') return null;
  return {
    source_id,
    source_type,
    ctwa_clid,
    headline:   pick('headline', 'title'),
    body:       pick('body', 'ad_body'),
    source_url: pick('source_url', 'sourceUrl', 'url'),
    // Mídia da prévia do anúncio (Meta CTWA): image_url quando media_type=image;
    // video_url + thumbnail_url quando media_type=video. Usado no card do chat.
    media_type:    pick('media_type', 'mediaType'),
    image_url:     pick('image_url', 'imageUrl'),
    video_url:     pick('video_url', 'videoUrl'),
    thumbnail_url: pick('thumbnail_url', 'thumbnailUrl'),
  };
}

// Retorna { signal, referral, fromAds }.
//  - referral: objeto normalizado p/ captura (quando anúncio real).
//  - signal:   só true quando há objeto referral REAL que NÃO normalizou (raro) —
//              dispara log bruto p/ inspeção. `referral:null` padrão NÃO dispara,
//              evitando spam de payload (com tokens) em toda mensagem.
//  - fromAds:  marcador de anúncio persistente no ticket (semântica a confirmar).
function detectReferral(body) {
  const acc = { referral: null };
  scanForReferral(body, 0, acc);
  const referral = normalizeReferral(acc.referral);

  const rawFromAds = body?.ticketData?.fromAds ?? body?.ticket?.fromAds ?? null;
  const fromAds = rawFromAds != null && rawFromAds !== 0 && rawFromAds !== false ? rawFromAds : null;

  return { signal: acc.referral != null && !referral, referral, fromAds };
}

// ticketData.channel values observed: "instagram", "whatsapp_meta"
function detectCanal(body) {
  const ch = body?.ticketData?.channel ?? body?.contact?.channel ?? null;
  if (ch === 'instagram') return 'instagram';
  return 'whatsapp';
}

function extractMercadophoneTicketId(body) {
  if (body?.ticketData?.id != null) return String(body.ticketData.id);
  if (body?.chamadoId != null) return String(body.chamadoId);
  return null;
}

function extractLeadInfo(body) {
  // Keep identifier exactly as received from MercadoPhone — no normalization
  const identifier = body.sender || body.contact?.number || null;

  // Name fallback chain: most specific → least specific → raw phone
  let contactName =
    body.name ||
    body.contact?.name ||
    body.ticketData?.contact?.name ||
    body.mensagem?.contact?.name ||
    null;

  if (!contactName && body.mensagem?.dataJson) {
    try {
      const dj = JSON.parse(body.mensagem.dataJson);
      contactName = dj?.contact?.name || dj?.name || null;
    } catch { /* ignore malformed dataJson */ }
  }

  if (!contactName) contactName = identifier;

  return { identifier, contactName };
}

export function parseWhatsAppWebhook(body) {
  const acao = body?.acao;
  const fromMe = Boolean(body?.fromMe);
  // userId null = BIA; string/number = human attendant ID no MercadoPhone
  const userId = Object.prototype.hasOwnProperty.call(body ?? {}, 'userId') ? body.userId : undefined;
  const externalTicketId = body?.chamadoId != null ? String(body.chamadoId) : null;

  const detectedCanal        = detectCanal(body);
  const mercadophoneTicketId = extractMercadophoneTicketId(body);
  const { signal: referralSignal, referral, fromAds } = detectReferral(body);

  if (acao === 'start') {
    return {
      kind: 'lifecycle',
      action: 'ticket_started',
      lead: { ...extractLeadInfo(body), detectedCanal, mercadophoneTicketId },
      referralSignal,
      referral,
      fromAds,
      externalTicketId,
      protocolo: body.protocolo ?? null,
    };
  }

  if (acao === 'from_internal') {
    const msg = body.mensagem ?? {};
    const lead = { ...extractLeadInfo(body), detectedCanal, mercadophoneTicketId };

    if (!fromMe) {
      const rawText = msg.body || null;
      // MercadoPhone sends this error string as body when audio conversion fails — the real audio is in mediaUrl
      const isAudioErrorPlaceholder = rawText === 'Erro ao realizar conversão de áudio!' && Boolean(msg.mediaUrl);
      return {
        kind: 'incoming',
        lead,
        referralSignal,
        referral,
        fromAds,
        message: {
          externalMessageId: msg.wid || null,
          text: isAudioErrorPlaceholder ? '' : rawText,
          mediaUrl: msg.mediaUrl || null,
          tipo: 'cliente',
        },
        externalTicketId,
      };
    }

    // fromMe === true: echo do MercadoPhone
    // userId null = mensagem enviada pela BIA (via CRM ou n8n)
    // userId !== null = atendente humano digitou diretamente no MercadoPhone
    const isHumanAttendantOnMercadoPhone = userId != null;
    return {
      kind: 'echo',
      isHumanAttendantOnMercadoPhone,
      lead,
      referralSignal,
      referral,
      fromAds,
      message: {
        externalMessageId: msg.wid || null,
        text: msg.body || null,
        mediaUrl: msg.mediaUrl || null,
        tipo: isHumanAttendantOnMercadoPhone ? 'atendente' : 'bia_echo',
      },
      externalTicketId,
    };
  }

  return { kind: 'unknown', rawAcao: acao, body };
}
