import path from 'path';
import prisma from '../lib/prisma.js';
import { getSetting, getSettingInt } from '../lib/settings-cache.js';

const AUDIO_EXTS = new Set(['.opus', '.ogg', '.mp3', '.m4a', '.aac', '.wav', '.webm']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mov', '.mkv']);
const AUDIO_ERROR_TEXT = 'Erro ao realizar conversão de áudio!';

function getMediaType(mediaUrl) {
  if (!mediaUrl) return null;
  const ext = path.extname(mediaUrl).toLowerCase();
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

function toAbsoluteUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const base = (getSetting('FRONTEND_URL') || process.env.FRONTEND_URL || 'https://crm.teknoscel.shop').replace(/\/$/, '');
  return `${base}${url}`;
}

// Map<leadId, { timer: NodeJS.Timeout, scheduledAt: number }>
const pending = new Map();

export async function scheduleBiaDispatch(lead, canal) {
  const leadId = lead.id;

  // Cancela e reagenda se chegou mensagem nova antes do timer disparar
  if (pending.has(leadId)) {
    clearTimeout(pending.get(leadId).timer);
  }

  const delay = getSettingInt('BIA_GROUPING_DELAY_MS', 8000);

  const timer = setTimeout(async () => {
    pending.delete(leadId);
    try {
      await dispatchBiaForLead(lead, canal);
    } catch (err) {
      console.error(`[bia-dispatcher] dispatch erro lead ${leadId}:`, err.message);
    }
  }, delay);

  pending.set(leadId, { timer, scheduledAt: Date.now() });
}

async function dispatchBiaForLead(lead, canal) {
  const payload = await buildBiaPayload(lead, canal);
  if (!payload) {
    console.log(`[bia-dispatcher] sem mensagens cliente para lead ${lead.id} — abortando dispatch`);
    return;
  }
  await callBiaWebhook(payload);
}

async function buildBiaPayload(lead, canal) {
  const messages = await prisma.message.findMany({
    where: { leadId: lead.id },
    orderBy: { criadoEm: 'desc' },
    take: 20,
    select: { tipo: true, texto: true, criadoEm: true, mediaUrl: true },
  });

  const contexto = messages.reverse().map(m => ({
    tipo: m.tipo,
    texto: (m.texto === AUDIO_ERROR_TEXT && m.mediaUrl) ? '' : m.texto,
    criadoEm: m.criadoEm,
    mediaUrl: toAbsoluteUrl(m.mediaUrl),
  }));

  const clienteMessages = contexto.filter(m => m.tipo === 'cliente');
  if (clienteMessages.length === 0) return null;

  const lastMsg = clienteMessages[clienteMessages.length - 1];
  const mediaType = getMediaType(lastMsg.mediaUrl);

  // When last message is audio, don't send the MercadoPhone error placeholder as text
  const mensagemCliente = (mediaType === 'audio' && (!lastMsg.texto || lastMsg.texto === AUDIO_ERROR_TEXT))
    ? ''
    : lastMsg.texto;

  return {
    leadId: lead.id,
    leadNome: lead.nome || null,
    canal,
    mensagemCliente,
    ...(mediaType ? { mediaType, mediaUrl: lastMsg.mediaUrl } : {}),
    contexto,
  };
}

async function callBiaWebhook(payload) {
  const url = getSetting('BIA_WEBHOOK_URL');
  if (!url) {
    console.warn('[bia-dispatcher] BIA_WEBHOOK_URL não configurado — dispatch ignorado');
    return;
  }

  const secret = getSetting('BIA_SECRET');
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Bia-Secret'] = secret;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.error(`[bia-dispatcher] n8n status=${res.status} body=${text.slice(0, 200)}`);
    } else {
      console.log(`[bia-dispatcher] BIA acionado para lead ${payload.leadId}`);
    }
  } catch (err) {
    console.error('[bia-dispatcher] fetch erro:', err.message);
  }
}
