import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { ingestMessage } from '../core/ingestion.js';
import { sendToCustomer } from '../core/outbound.js';
import { getSetting } from '../lib/settings-cache.js';

// Best-effort — log warn, não bloqueia. TODO: enforce em prod capturando raw body via onRequest hook.
function checkMetaSignature(req) {
  if (!process.env.META_APP_SECRET) return;
  const header = req.headers['x-hub-signature-256'];
  if (!header) {
    console.warn('[webhook] X-Hub-Signature-256 ausente — skipping validation (configure META_APP_SECRET + raw body capture para enforçar em prod)');
  }
  // TODO: prod enforcement — computar hmac-sha256(META_APP_SECRET, rawBody) e comparar
}

function checkMercadophoneSignature(req) {
  const secret = process.env.OUTGOING_WEBHOOK_SECRET;
  if (!secret) return;
  const header = req.headers['x-webhook-secret'] || req.headers['x-hub-signature-256'];
  if (!header || header !== secret) {
    // TODO: rejeitar em prod quando signature inválida
    console.warn('[webhook:whatsapp] signature ausente/inválida — skipping em dev');
  }
}

// channelKey = chave do verify token específico do canal (ex: META_VERIFY_TOKEN_INSTAGRAM).
// Aceita o token do canal (configurável na UI) e cai pro compartilhado META_VERIFY_TOKEN.
function verifyMetaChallenge(req, reply, channelKey) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected  = getSetting(channelKey) || getSetting('META_VERIFY_TOKEN');
  if (mode === 'subscribe' && token && expected && token === expected) {
    return reply.send(challenge);
  }
  console.warn(`[webhook] Meta challenge falhou (${channelKey}) — hub.verify_token não bate`);
  return reply.code(403).send('Forbidden');
}

export default async function webhookRoutes(fastify) {
  // ── WhatsApp (MercadoPhone) ──────────────────────────────────────────────
  fastify.post('/api/webhooks/whatsapp', async (req, reply) => {
    checkMercadophoneSignature(req);
    reply.code(200).send({ ok: true }); // responde ANTES de processar

    ingestMessage('whatsapp', req.body)
      .catch(err => console.error('[webhook:whatsapp]', err.message));
  });

  // ── Instagram ────────────────────────────────────────────────────────────
  fastify.get('/api/webhooks/instagram', async (req, reply) => {
    return verifyMetaChallenge(req, reply, 'META_VERIFY_TOKEN_INSTAGRAM');
  });

  fastify.post('/api/webhooks/instagram', async (req, reply) => {
    checkMetaSignature(req);
    reply.code(200).send({ ok: true });

    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      for (const messaging of (entry.messaging ?? [])) {
        ingestMessage('instagram', messaging)
          .catch(err => console.error('[webhook:instagram]', err.message));
      }
    }
  });

  // ── Messenger (Facebook) ─────────────────────────────────────────────────
  fastify.get('/api/webhooks/messenger', async (req, reply) => {
    return verifyMetaChallenge(req, reply, 'META_VERIFY_TOKEN_MESSENGER');
  });

  fastify.post('/api/webhooks/messenger', async (req, reply) => {
    checkMetaSignature(req);
    reply.code(200).send({ ok: true });

    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      for (const messaging of (entry.messaging ?? [])) {
        ingestMessage('messenger', messaging)
          .catch(err => console.error('[webhook:messenger]', err.message));
      }
    }
  });

  // ── TikTok (stub) ────────────────────────────────────────────────────────
  fastify.post('/api/webhooks/tiktok', async (req, reply) => {
    // TODO: implementar parseWebhook quando TIKTOK_TOKEN estiver em ChannelConfig
    console.log('[webhook:tiktok] payload recebido (stub):', JSON.stringify(req.body ?? {}).slice(0, 200));
    return reply.code(200).send({ ok: true });
  });

  // ── BIA response callback (n8n → CRM) ────────────────────────────────────
  // Payload: { lead_id, respostas: [{ texto, mediaUrl? }], metadata? }
  fastify.post('/api/webhooks/bia-response', async (req, reply) => {
    const secret = process.env.BIA_SECRET;
    if (secret && req.headers['x-bia-secret'] !== secret) {
      console.warn('[webhook:bia] X-Bia-Secret inválido');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { lead_id, respostas, metadata } = req.body ?? {};
    if (!lead_id || !Array.isArray(respostas) || respostas.length === 0) {
      console.warn('[webhook:bia] lead_id ou respostas[] ausentes/inválidos');
      return reply.code(400).send({ error: 'lead_id e respostas[] obrigatórios' });
    }

    reply.code(200).send({ ok: true, queued: respostas.length });

    const interDelay = parseInt(process.env.BIA_INTER_MESSAGE_DELAY_MS || '2000', 10);

    // Fire-and-forget: envia cada resposta com delay entre mensagens
    ;(async () => {
      // Persiste classificação da Bia no campo metadata do lead
      if (metadata && typeof metadata === 'object') {
        const { intencao, lead_score, estado_atendimento, urgencia, complexidade, humano, resumo } = metadata;
        const biaData = {};
        if (intencao !== undefined) biaData.intencao = intencao;
        if (lead_score !== undefined) biaData.lead_score = lead_score;
        if (estado_atendimento !== undefined) biaData.estado_atendimento = estado_atendimento;
        if (urgencia !== undefined) biaData.urgencia = urgencia;
        if (complexidade !== undefined) biaData.complexidade = complexidade;
        if (humano !== undefined) biaData.humano = humano;
        if (resumo !== undefined) biaData.resumo_bia = resumo;
        if (Object.keys(biaData).length > 0) {
          await prisma.lead.update({
            where: { id: lead_id },
            data: { metadata: biaData },
          }).catch(err => console.warn('[webhook:bia] metadata update failed:', err.message));
        }
      }

      let persistedCount = 0;
      let sentCount = 0;
      for (const [i, r] of respostas.entries()) {
        if (i > 0) await new Promise(res => setTimeout(res, interDelay));
        try {
          const result = await sendToCustomer(lead_id, r.texto, r.mediaUrl ?? null);
          persistedCount++;
          if (result?.delivery?.success) sentCount++;
        } catch (err) {
          console.error(`[webhook:bia] erro na resposta ${i + 1}:`, err.message);
        }
      }
      console.log(`[webhook:bia] lead ${lead_id}: persisted=${persistedCount} sent=${sentCount}`);
    })().catch(err => console.error('[webhook:bia] async error:', err.message));
  });

  // ── MEMÓRIA — atualiza resumo vivo da conversa (workflow BIA_CRM_FULL_memoria) ──
  const resumoSchema = z.object({
    resumo: z.string().min(1).max(5000),
  });

  fastify.patch('/api/leads/:id/resumo', async (req, reply) => {
    const secret = process.env.BIA_SECRET;
    if (secret && req.headers['x-bia-secret'] !== secret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = resumoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!lead) return reply.code(404).send({ error: 'lead_not_found' });

    const updated = await prisma.lead.update({
      where: { id: req.params.id },
      data: { resumo: parsed.data.resumo },
      select: { id: true, atualizadoEm: true },
    });

    return { ok: true, lead_id: updated.id, updated_at: updated.atualizadoEm.toISOString() };
  });

  // ── HANDOFF — notificar agente do lead quente (workflow BIA_CRM_FULL_handoff) ──
  const handoffSchema = z.object({
    lead_id:        z.string().min(1),
    lead_nome:      z.string().nullish(),
    lead_telefone:  z.string().nullish(),
    handoff_reason: z.string().optional(),
    metadata:       z.record(z.unknown()).optional(),
    agente_id:      z.string().nullable().optional(),
    agente_nome:    z.string().nullable().optional(),
    timestamp:      z.string().optional(),
    is_assistencia: z.union([z.boolean(), z.string()]).nullish(),
  });

  fastify.post('/api/webhooks/handoff-notify', async (req, reply) => {
    const secret = process.env.BIA_SECRET;
    if (secret && req.headers['x-bia-secret'] !== secret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = handoffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.issues });
    }

    const { lead_id, agente_id, agente_nome, handoff_reason, metadata, timestamp, lead_nome, lead_telefone } = parsed.data;
    const isAssistencia = parsed.data.is_assistencia === true || parsed.data.is_assistencia === 'true';

    // Precisamos do metadata/tags atuais: o update do Prisma substitui o Json inteiro,
    // então mesclamos à mão pra não apagar origem/ads/quizData/classificação da Bia.
    const existing = await prisma.lead.findUnique({
      where: { id: lead_id },
      select: { metadata: true, tags: true },
    });
    if (!existing) return reply.code(404).send({ error: 'lead_not_found' });

    const meta = existing.metadata && typeof existing.metadata === 'object' ? { ...existing.metadata } : {};
    if (agente_id) {
      // Já nasce com dono → nunca vira handoff pendente.
      delete meta.handoffPendenteDesde;
    } else if (meta.handoffPendenteDesde == null) {
      // Sem dono: registra o momento (preserva o original se já houver — não reseta o relógio).
      meta.handoffPendenteDesde =
        timestamp && !Number.isNaN(Date.parse(timestamp))
          ? new Date(timestamp).toISOString()
          : new Date().toISOString();
    }

    let tags = Array.isArray(existing.tags) ? existing.tags : [];
    if (isAssistencia && !tags.includes('assistencia')) tags = [...tags, 'assistencia'];

    const updateData = { biaAtiva: false, metadata: meta, tags };
    if (agente_id) {
      updateData.atendenteId = agente_id;
      updateData.statusPipeline = 'em_atendimento';
    }

    let lead;
    try {
      lead = await prisma.lead.update({
        where: { id: lead_id },
        data: updateData,
        select: { id: true },
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return reply.code(404).send({ error: 'lead_not_found' });
      }
      throw err;
    }

    const eventPayload = { lead_id, lead_nome, lead_telefone, handoff_reason, metadata, agente_id, agente_nome, timestamp };
    const notified = !!fastify.io;
    fastify.io?.emit('handoff:new', eventPayload);

    return { ok: true, notified, lead_id };
  });
}
