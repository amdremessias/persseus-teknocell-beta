import prisma from '../lib/prisma.js';
import { getAdapter } from '../channels/index.js';
import { scheduleBiaDispatch } from './bia-dispatcher.js';
import { getSetting, getSettingBool } from '../lib/settings-cache.js';
import { resolveInstagramName } from '../channels/instagram/profile.js';
import { downloadMedia } from '../lib/media-downloader.js';
import { dispatchPush } from '../lib/push.js';
import { stopFollowupForNumber } from '../services/followup.js';
import { stopPosVendaForNumber } from '../services/posvenda.js';

let _io = null;

export function setupIngestion(io) {
  _io = io;
}

export async function ingestMessage(canal, rawPayload) {
  const adapter = getAdapter(canal);

  let parsed;
  try {
    parsed = adapter.parseWebhook(rawPayload);
  } catch (err) {
    console.error(`[ingestion] parse error (${canal}):`, err.message);
    throw err;
  }

  // Log defensivo (sem spam): referral:null é padrão em toda msg e NÃO loga.
  //  • referral real capturado → loga normalizado + bruto (momento do 1º anúncio).
  //  • referral presente mas não normalizável → loga bruto p/ inspeção (raro).
  if (parsed.referral) {
    console.log(`[ads-referral] REFERRAL capturado (kind=${parsed.kind}, fromAds=${parsed.fromAds ?? '-'}):`, JSON.stringify(parsed.referral));
    console.log(`[ads-referral] payload bruto:`, JSON.stringify(rawPayload));
  } else if (parsed.referralSignal) {
    console.log(`[ads-referral] referral presente mas não normalizável (kind=${parsed.kind}) — payload bruto:`, JSON.stringify(rawPayload));
  }

  switch (parsed.kind) {
    case 'lifecycle': return handleLifecycle(canal, parsed, rawPayload);
    case 'incoming':  return handleIncoming(canal, parsed, rawPayload);
    case 'echo':      return handleEcho(canal, parsed, rawPayload);
    default:
      console.warn(`[ingestion] kind desconhecido "${parsed.rawAcao}" — ignorado`);
      return { skipped: true, reason: 'unknown_kind' };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function dedup(eventId, source, canal, payload) {
  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (existing) {
    console.log(`[ingestion] evento duplicado ignorado: ${eventId}`);
    return { duplicate: true };
  }
  try {
    const we = await prisma.webhookEvent.create({
      data: { eventId, source, canal, payload, processed: false },
    });
    return { duplicate: false, webhookEvent: we };
  } catch (err) {
    if (err.code === 'P2002') {
      console.log(`[ingestion] race condition dedup: ${eventId}`);
      return { duplicate: true };
    }
    throw err;
  }
}

async function upsertLead(canal, leadInfo, createOverrides = {}) {
  const { identifier, contactName, mercadophoneTicketId } = leadInfo;
  const lead = await prisma.lead.upsert({
    where: { lead_canal_identifier_uk: { canal, identifierCanal: identifier } },
    create: {
      canal,
      identifierCanal: identifier,
      nome: contactName,
      telefone: canal === 'whatsapp' ? identifier : null,
      canalOrigem: canal,
      canalMensagem: canal,
      statusPipeline: 'novo',
      ...(mercadophoneTicketId ? { mercadophoneTicketUuid: mercadophoneTicketId } : {}),
      ...createOverrides,
    },
    update: {
      atualizadoEm: new Date(),
      // Always refresh ticketId so replies use the latest active ticket
      ...(mercadophoneTicketId ? { mercadophoneTicketUuid: mercadophoneTicketId } : {}),
    },
  });

  // Upgrade nome only when stored value is a phone placeholder and we now have a real name
  const isPlaceholder = !lead.nome || lead.nome === identifier || lead.nome === 'Lead sem nome';
  const hasRealName = contactName && contactName !== identifier;
  if (isPlaceholder && hasRealName) {
    return prisma.lead.update({ where: { id: lead.id }, data: { nome: contactName } });
  }

  return lead;
}

// Grava origem "ads" no lead a partir do referral CTWA, sem nunca sobrescrever
// uma origem já registrada. Adiciona a tag "ads" (sem duplicar). Retorna o lead
// (atualizado se houve captura, o original caso contrário).
async function captureAdsOrigin(lead, referral) {
  if (!referral) return lead;
  const meta = lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};
  if (meta.origem) return lead; // NUNCA sobrescreve origem existente

  const ads = {
    source_id:   referral.source_id ?? null,
    headline:    referral.headline ?? null,
    source_url:  referral.source_url ?? null,
    ctwa_clid:   referral.ctwa_clid ?? null,
    ...(referral.body ? { body: referral.body } : {}),
    ...(referral.source_type ? { source_type: referral.source_type } : {}),
    detectado_em: new Date().toISOString(),
  };
  const tags = Array.isArray(lead.tags) ? lead.tags : [];
  const nextTags = tags.includes('ads') ? tags : [...tags, 'ads'];

  try {
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { metadata: { ...meta, origem: 'ads', ads }, tags: nextTags },
    });
    console.log(`[ads-referral] origem=ads capturada lead=${lead.id} source_id=${ads.source_id ?? '?'}`);
    return updated;
  } catch (err) {
    console.error(`[ads-referral] falha ao gravar origem lead=${lead.id}:`, err.message);
    return lead;
  }
}

// ── handlers ─────────────────────────────────────────────────────────────────

async function handleLifecycle(canal, parsed, rawPayload) {
  const effectiveCanal = parsed.lead?.detectedCanal || canal;
  const source = effectiveCanal === 'whatsapp' ? 'mercadophone' : `meta_${effectiveCanal}`;
  const eventId = `start_${effectiveCanal}_${parsed.externalTicketId}`;
  const { duplicate, webhookEvent } = await dedup(eventId, source, effectiveCanal, rawPayload);
  if (duplicate) return { idempotent: true, eventId };

  const { identifier } = parsed.lead;
  if (!identifier) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { erroMsg: 'identifier ausente no start' },
    });
    console.warn('[ingestion:lifecycle] identifier ausente — skip');
    return { skipped: true, reason: 'no_identifier' };
  }

  let lead = await upsertLead(effectiveCanal, parsed.lead);
  lead = await captureAdsOrigin(lead, parsed.referral);
  await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { processed: true } });

  if (_io) {
    _io.emit('lead:updated', { id: lead.id, atualizadoEm: new Date() });
    _io.emit('lead:new', { id: lead.id, nome: lead.nome, canal });
  }

  return { lead, kind: 'lifecycle' };
}

async function handleIncoming(canal, parsed, rawPayload) {
  const { message, lead: leadInfo } = parsed;
  const effectiveCanal = leadInfo?.detectedCanal || canal;
  const eventId = message.externalMessageId;
  if (!eventId) {
    console.warn('[ingestion:incoming] wid ausente — ignorando mensagem sem ID');
    return { skipped: true, reason: 'no_wid' };
  }

  const source = effectiveCanal === 'whatsapp' ? 'mercadophone' : `mercadophone_${effectiveCanal}`;
  const { duplicate, webhookEvent } = await dedup(eventId, source, effectiveCanal, rawPayload);
  if (duplicate) return { idempotent: true, eventId };

  // Instagram: a Meta não manda o nome no webhook — busca via Graph API (cacheado)
  // antes do upsert pra o lead já nascer com o nome real.
  if (effectiveCanal === 'instagram' && !leadInfo.contactName) {
    leadInfo.contactName = await resolveInstagramName(leadInfo.identifier);
  }

  let lead = await upsertLead(effectiveCanal, leadInfo);
  // Captura origem de anúncio CTWA (1ª msg do lead, ou qualquer msg se sem origem)
  lead = await captureAdsOrigin(lead, parsed.referral);

  // Persiste a mensagem real do cliente (histórico)
  let resolvedMediaUrl = message.mediaUrl || null;
  if (resolvedMediaUrl && /^https?:\/\//.test(resolvedMediaUrl)) {
    const local = await downloadMedia(resolvedMediaUrl);
    if (local) resolvedMediaUrl = local;
  }

  let msg;
  try {
    msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo: 'cliente',
        texto: message.text || '',
        canal: effectiveCanal,
        externalMessageId: eventId,
        ...(resolvedMediaUrl ? { mediaUrl: resolvedMediaUrl } : {}),
        deliveryStatus: null,
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      console.log(`[ingestion:incoming] message duplicada: ${eventId}`);
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true, erroMsg: 'message duplicate' },
      });
      return { idempotent: true, eventId };
    }
    await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { erroMsg: err.message } });
    throw err;
  }

  await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { processed: true } });

  // Push notification — fire-and-forget, nunca quebra o fluxo
  dispatchPush({ lead, message: { texto: msg.texto, mediaUrl: msg.mediaUrl } }).catch(() => {});

  // Stop any active follow-up sequence when client responds (WhatsApp only)
  if (effectiveCanal === 'whatsapp') {
    const phone = lead.telefone || lead.identifierCanal;
    if (phone) {
      stopFollowupForNumber(phone).catch(() => {});
      stopPosVendaForNumber(phone).catch(() => {});
    }
  }

  if (_io) {
    _io.to(`lead:${lead.id}`).emit('message:new', msg);
    _io.emit('lead:updated', { id: lead.id, atualizadoEm: new Date() });
    _io.emit('message:incoming', {
      leadId: lead.id,
      leadNome: lead.nome,
      canal: effectiveCanal,
      texto: message.text || '',
    });
  }

  // Só dispara BIA se BIA_MODE=active (default é observer).
  // Instagram cai pra atendente humano por padrão — a Bia no IG fica atrás do
  // switch BIA_INSTAGRAM_ENABLED (decisão de ligar é de produto, default off).
  const biaMode = getSetting('BIA_MODE', 'observer');
  const biaCanalOk = effectiveCanal === 'whatsapp' || getSettingBool('BIA_INSTAGRAM_ENABLED', false);
  if (biaMode === 'active' && lead.biaAtiva && biaCanalOk) {
    setImmediate(() => {
      scheduleBiaDispatch(lead, effectiveCanal)
        .catch(err => console.error('[ingestion:incoming] scheduleBiaDispatch error:', err.message));
    });
  }

  return { lead, message: msg, kind: 'incoming' };
}

async function handleEcho(canal, parsed, rawPayload) {
  const { message, lead: leadInfo, isHumanAttendantOnMercadoPhone } = parsed;
  const effectiveCanal = leadInfo?.detectedCanal || canal;
  const eventId = message.externalMessageId;
  if (!eventId) {
    console.warn('[ingestion:echo] wid ausente — ignorando echo sem ID');
    return { skipped: true, reason: 'no_wid' };
  }

  const source = effectiveCanal === 'whatsapp' ? 'mercadophone' : `mercadophone_${effectiveCanal}`;
  const { duplicate, webhookEvent } = await dedup(eventId, source, effectiveCanal, rawPayload);
  if (duplicate) return { idempotent: true, eventId };

  // Filter MercadoPhone system error echoes — never pollute the chat timeline
  const bodyText = message.text || '';
  const isSystemError = bodyText.startsWith('❌')
    || /erro ao enviar template/i.test(bodyText)
    || /^media upload error/i.test(bodyText)
    || /downloading media from weblink failed/i.test(bodyText);
  if (isSystemError) {
    await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { processed: true, erroMsg: 'system_error_filtered' } });
    console.log(`[ingestion:echo] system error filtrado: "${bodyText.slice(0, 100)}"`);
    return { skipped: true, reason: 'system_error_filtered' };
  }

  // Echo não cria lead — só persiste se o lead já existir
  const { identifier } = leadInfo;
  let lead = null;
  if (identifier) {
    lead = await prisma.lead.findUnique({
      where: { lead_canal_identifier_uk: { canal: effectiveCanal, identifierCanal: identifier } },
    });
  }

  let isNewPosvenda = false;
  if (!lead) {
    // Non-WhatsApp (ex: Instagram): echo NUNCA cria lead — só ecoa em lead existente.
    // (No WhatsApp, echo de recibo/template pode criar lead pos_venda — mantido.)
    if (!identifier || effectiveCanal !== 'whatsapp') {
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { erroMsg: 'lead_not_found_for_echo' },
      });
      return { skipped: true, reason: 'lead_not_found' };
    }

    // Outbound message to a contact not yet in CRM (receipt, template, panel message)
    // Create the lead as pos_venda so the follow-up engine ignores it
    lead = await upsertLead(effectiveCanal, leadInfo, { statusPipeline: 'pos_venda' });
    isNewPosvenda = true;
    console.log(`[ingestion:echo] novo lead pos_venda criado: ${identifier} "${lead.nome}"`);
  }

  let resolvedEchoMediaUrl = message.mediaUrl || null;
  if (resolvedEchoMediaUrl && /^https?:\/\//.test(resolvedEchoMediaUrl)) {
    const local = await downloadMedia(resolvedEchoMediaUrl);
    if (local) resolvedEchoMediaUrl = local;
  }

  let msg;
  try {
    // bia_echo não é valor do enum — persiste como 'bia' (semântica idêntica)
    // Para leads recém-criados por recibo/template, sempre 'atendente' (userId=null é artefato do MercadoPhone)
    const tipoDb = isNewPosvenda ? 'atendente' : (message.tipo === 'bia_echo' ? 'bia' : message.tipo);
    msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo: tipoDb,
        texto: message.text || '',
        canal: effectiveCanal,
        externalMessageId: eventId,
        ...(resolvedEchoMediaUrl ? { mediaUrl: resolvedEchoMediaUrl } : {}),
        deliveryStatus: 'received_echo',
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      console.log(`[ingestion:echo] echo já persistido: ${eventId}`);
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true, erroMsg: 'message duplicate' },
      });
      return { idempotent: true, eventId };
    }
    await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { erroMsg: err.message } });
    throw err;
  }

  await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { processed: true } });

  if (_io) {
    _io.to(`lead:${lead.id}`).emit('message:new', msg);
    _io.emit('lead:updated', { id: lead.id, atualizadoEm: new Date() });
    // Sem message:incoming global — echo não gera notificação toast
  }

  return { lead, message: msg, kind: 'echo', isHumanAttendantOnMercadoPhone };
}
