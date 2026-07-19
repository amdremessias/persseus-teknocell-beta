import { spawn } from "child_process";
import prisma from "../lib/prisma.js";
import { calcScore } from "../lib/scoring.js";
import { assignToQueue } from "../services/queue.js";
import { dispatchPush } from "../lib/push.js";

const AUDIO_NEEDS_TRANSCODE_RE = /\.(opus|ogg|oga|webm)(\?|$)/i;

function transcodeToMp3(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-c:a", "libmp3lame",
      "-b:a", "64k",
      "-ar", "22050",
      "-f", "mp3",
      "pipe:1",
    ]);
    const chunks = [];
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stdout.on("end", () => resolve(Buffer.concat(chunks)));
    ff.stderr.on("data", () => {});
    ff.on("error", reject);
    ff.stdin.write(inputBuffer);
    ff.stdin.end();
  });
}

function verifyWebhookSecret(req, reply) {
  const secret = process.env.OUTGOING_WEBHOOK_SECRET;
  if (secret && req.headers["x-webhook-secret"] !== secret) {
    reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export default async function publicRoutes(fastify) {
  // DEPRECATED: use POST /api/webhooks/whatsapp (ou canal correspondente)
  // Mantido apenas para rollback safety — retorna 410 Gone
  fastify.post("/api/public/leads/incoming", async (_req, reply) => {
    return reply.code(410).send({ error: "Gone — use POST /api/webhooks/<canal>", docs: "/api/webhooks/whatsapp" });
    /* eslint-disable no-unreachable */
    const body = _req.body ?? {};
    // ↓↓↓ handler original preservado para rollback — não executa ↓↓↓

    const telefone =
      body.telefone || body.phone || body.numero || body.celular ||
      body.sender   || body.external_id || body.externalId || null;

    const externalId = body.external_id || body.externalId || telefone;

    // Full data used for CREATE
    const createData = {
      externalId,
      nome: body.nome || body.name || null,
      telefone,
      email: body.email || null,
      canalOrigem: body.canal_origem || body.canal || body.channel || null,
      canalMensagem: body.canal_mensagem || body.canal || body.channel || null,
      fonteCampanha: body.fonte_campanha || body.utm_campaign || null,
      interesse: body.interesse || null,
      modeloDesejado: body.modelo_desejado || null,
      estadoPreferido: body.estado_preferido || null,
      faixaInvestimento: body.faixa_investimento || null,
      vaiTrocar: body.vai_trocar ?? null,
      modeloTroca: body.modelo_troca || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
    };

    // For UPDATE: only send fields that have actual values (don't overwrite good data with "")
    const updateData = { atualizadoEm: new Date() };
    for (const [k, v] of Object.entries(createData)) {
      if (k !== "externalId" && v !== null && v !== undefined && v !== "") {
        updateData[k] = v;
      }
    }

    let lead;
    let isNew = false;
    if (externalId) {
      const existing = await prisma.lead.findUnique({ where: { externalId } });
      isNew = !existing;
      lead = await prisma.lead.upsert({
        where: { externalId },
        update: updateData,
        create: createData,
      });
    } else {
      lead = await prisma.lead.create({ data: createData });
      isNew = true;
    }

    const canal = createData.canalMensagem;
    const newMessages = [];

    // Save client message and emit to chat room for real-time display
    if (body.mensagem) {
      const msg = await prisma.message.create({
        data: { leadId: lead.id, tipo: "cliente", texto: body.mensagem, canal },
      });
      newMessages.push(msg);
      fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);
      dispatchPush({ lead, message: { texto: msg.texto, mediaUrl: null } }).catch(() => {});
    }

    // Save BIA response and emit to chat room for real-time display
    if (body.mensagem_bia) {
      const msg = await prisma.message.create({
        data: { leadId: lead.id, tipo: "bia", texto: body.mensagem_bia, canal },
      });
      newMessages.push(msg);
      fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);
    }

    const msgCount = await prisma.message.count({ where: { leadId: lead.id } });
    const score = calcScore({ ...lead, _count: { messages: msgCount } });
    await prisma.lead.update({ where: { id: lead.id }, data: { score } });

    if (isNew && lead.statusPipeline === "novo") {
      await assignToQueue(lead.id);
    }

    const event = isNew ? "lead:new" : "lead:updated";
    fastify.io?.emit(event, { ...lead, score });

    return reply.code(201).send({ id: lead.id, score });
    /* eslint-enable no-unreachable */
  });

  // Receive leads from external forms (landing pages, ads forms)
  fastify.post("/api/public/leads/external", async (req, reply) => {
    const body = req.body;
    const lead = await prisma.lead.create({
      data: {
        nome: body.nome || body.name,
        telefone: body.telefone || body.phone,
        email: body.email,
        canalOrigem: body.origem || "formulario",
        fonteCampanha: body.utm_campaign,
        interesse: body.interesse,
        modeloDesejado: body.modelo,
        faixaInvestimento: body.faixa_investimento,
        vaiTrocar: body.vai_trocar,
        statusPipeline: "novo",
        biaAtiva: false,
      },
    });
    await assignToQueue(lead.id);
    fastify.io?.emit("lead:new", lead);
    return reply.code(201).send({ id: lead.id });
  });

  // Archive lead — called by BIA/n8n when follow-up gets definitive negative
  fastify.post("/api/public/leads/:id/arquivar", async (req, reply) => {
    if (!verifyWebhookSecret(req, reply)) return;

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { statusPipeline: "arquivado", dataArquivamento: new Date() },
    });

    await prisma.queueAssignment.deleteMany({ where: { leadId: req.params.id } });

    fastify.io?.emit("lead:updated", lead);
    return reply.code(200).send({ id: lead.id, status: "arquivado" });
  });

  // Reactivate lead — called by BIA/n8n when follow-up gets positive intent
  fastify.post("/api/public/leads/:id/reativar", async (req, reply) => {
    if (!verifyWebhookSecret(req, reply)) return;

    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado" });

    const tags = Array.from(new Set([...(lead.tags || []), "reativado"]));

    const updated = await prisma.lead.update({
      where: { id: req.params.id },
      data: { statusPipeline: "novo", tags, dataArquivamento: null },
    });

    await assignToQueue(req.params.id);

    fastify.io?.emit("lead:updated", updated);
    return reply.code(200).send({ id: updated.id, status: "novo" });
  });

  // MercadoPhone / WhatsApp delivery status callback
  // Configure in MercadoPhone dashboard → callback URL: https://crm.teknoscel.shop/api/public/delivery-callback
  fastify.post("/api/public/delivery-callback", async (req, reply) => {
    const body = req.body ?? {};
    const extId  = body.id || body.messageId || body.message_id;
    const status = body.status || body.delivery_status;
    if (!extId || !status) return reply.code(200).send({ ok: true });

    const statusMap = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };
    const internalStatus = statusMap[String(status).toLowerCase()] || "sent";

    const msg = await prisma.message.findFirst({ where: { externalMessageId: String(extId) } });
    if (msg) {
      const updated = await prisma.message.update({
        where: { id: msg.id },
        data: { deliveryStatus: internalStatus },
      });
      fastify.io?.to(`lead:${msg.leadId}`).emit("message:updated", updated);
    }
    return reply.code(200).send({ ok: true });
  });

  // Audio proxy — fetches external audio (e.g. MercadoPhone .opus) and transcodes to MP3 via ffmpeg.
  // Transcoding ensures compatibility across Chrome, Firefox, Safari (opus not supported natively in Safari).
  fastify.get("/api/public/audio-proxy", async (req, reply) => {
    const { url } = req.query;
    if (!url || !/^https?:\/\//.test(url)) {
      return reply.code(400).send({ error: "invalid url" });
    }

    const fetchHeaders = {};
    if (/mercadophone|exclusivoapi/.test(url) && process.env.MERCADOPHONE_TOKEN) {
      fetchHeaders["Authorization"] = `Bearer ${process.env.MERCADOPHONE_TOKEN}`;
    }

    let upstream;
    try {
      upstream = await fetch(url, { headers: fetchHeaders });
    } catch (err) {
      return reply.code(502).send({ error: "upstream fetch failed" });
    }

    if (!upstream.ok) {
      return reply.code(upstream.status).send({ error: "upstream error" });
    }

    const upstreamCt = upstream.headers.get("content-type") || "";
    const needsTranscode = AUDIO_NEEDS_TRANSCODE_RE.test(url) || /ogg|opus|webm/.test(upstreamCt);

    const inputBuffer = Buffer.from(await upstream.arrayBuffer());

    if (needsTranscode) {
      try {
        const mp3 = await transcodeToMp3(inputBuffer);
        reply.header("Content-Type", "audio/mpeg");
        reply.header("Content-Length", String(mp3.length));
        reply.header("Accept-Ranges", "none");
        reply.header("Cache-Control", "public, max-age=86400");
        reply.header("Access-Control-Allow-Origin", "*");
        return reply.send(mp3);
      } catch (err) {
        console.warn("[audio-proxy] ffmpeg transcoding failed, serving raw:", err.message);
        // Fall through to raw serve
      }
    }

    const ct = upstreamCt || "audio/ogg; codecs=opus";
    reply.header("Content-Type", ct);
    reply.header("Content-Length", String(inputBuffer.length));
    reply.header("Accept-Ranges", "none");
    reply.header("Cache-Control", "public, max-age=3600");
    reply.header("Access-Control-Allow-Origin", "*");
    return reply.send(inputBuffer);
  });

  // Meta webhook verification
  fastify.get("/api/public/channels/facebook/verify", async (req, reply) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      return reply.send(challenge);
    }
    return reply.code(403).send("Forbidden");
  });
}
