import { pipeline } from "stream/promises";
import { createWriteStream, mkdirSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import path from "path";
import { randomUUID } from "crypto";
import prisma from "../lib/prisma.js";
import { calcScore } from "../lib/scoring.js";
import { assignToQueue } from "../services/queue.js";
import { fireWebhook } from "../services/webhooks.js";
import { sendTextMessage, sendTextViaTicket, sendMediaMessage } from "../services/outgoing.js";
import { dispatchPushToUser } from "../lib/push.js";
import { clearHandoffPendente } from "../services/handoffWatch.js";
import { getSuggestions } from "../services/suggestions.js";
import { getSetting } from "../lib/settings-cache.js";
import { finalizeConvertido } from "../services/leadStatus.js";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
const UPLOADS_URL = process.env.UPLOADS_URL || "https://crm.teknoscel.shop/api/uploads";
mkdirSync(UPLOADS_DIR, { recursive: true });

// Transcode webm audio (Chrome MediaRecorder output) to ogg/opus for WhatsApp compatibility.
async function transcodeWebmToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-hide_banner", "-loglevel", "error",
      "-i", inputPath,
      "-c:a", "libmp3lame",
      "-b:a", "64k",
      "-ar", "16000",
      "-ac", "1",
      "-f", "mp3",
      outputPath,
    ]);
    ff.stderr.on("data", () => {});
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    ff.on("error", reject);
  });
}

function getMercadoPhoneBase() {
  const url = getSetting("MERCADOPHONE_URL");
  try { return new URL(url || "").origin; } catch { return "https://exclusivoapi.mercadophone.tech"; }
}

function fireN8nBia({ telefone, leadId, userId, status }) {
  if (!telefone) {
    console.warn("[n8n:bia] fireN8nBia chamado sem telefone — abortado");
    return;
  }
  const n8nUrl = getSetting("N8N_BIA_URL", "https://n8n.teknoscel.shop/webhook/bia-teknos");
  const payload = {
    sender: telefone,
    chamadoId: leadId,
    acao: "action_from_user",
    companyId: 38,
    ticketData: { status, userId: userId ?? null },
    backendURL: getMercadoPhoneBase(),
    token_origin: getSetting("MERCADOPHONE_TOKEN", ""),
  };
  console.log(`[n8n:bia] enviando → ${n8nUrl}`, JSON.stringify(payload));
  fetch(n8nUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const body = await res.text().catch(() => "");
      console.log(`[n8n:bia] resposta status=${res.status} body=${body.slice(0, 200)}`);
    })
    .catch((err) => console.error("[n8n:bia] erro na chamada:", err.message));
}

async function applySignature(texto, userId) {
  const [enabledRow, templateRow, user] = await Promise.all([
    prisma.setting.findUnique({ where: { chave: "atendente_signature_enabled" } }),
    prisma.setting.findUnique({ where: { chave: "atendente_signature_template" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { nome: true } }),
  ]);

  if (enabledRow?.valor === "false") return texto;

  const template = templateRow?.valor || "*{nome}*\n\n{mensagem}";
  const nome = user?.nome || "";
  return template.replace("{nome}", nome).replace("{mensagem}", texto);
}

export default async function leadRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // List leads with filters
  fastify.get("/api/leads", auth, async (req) => {
    const { status, atendenteId, canal, q, page = 1, limit = 30 } = req.query;
    const where = {};
    if (status) where.statusPipeline = status;
    if (atendenteId) where.atendenteId = atendenteId;
    if (canal) where.canal = canal;
    if (q) {
      where.OR = [
        { nome: { contains: q, mode: "insensitive" } },
        { telefone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: {
          atendente: { select: { id: true, nome: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { atualizadoEm: "desc" },
        skip: (page - 1) * limit,
        take: Number(limit),
      }),
    ]);

    return { total, page: Number(page), leads };
  });

  fastify.get("/api/leads/:id", auth, async (req, reply) => {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        atendente: { select: { id: true, nome: true } },
        messages: { orderBy: { criadoEm: "asc" } },
        queueAssignments: { orderBy: { atribuidoEm: "desc" }, take: 5 },
      },
    });
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado" });
    return lead;
  });

  fastify.put("/api/leads/:id", auth, async (req, reply) => {
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: req.body,
      include: { atendente: { select: { id: true, nome: true } } },
    });
    fastify.io?.emit("lead:updated", lead);
    return lead;
  });

  // Delete lead — qualquer atendente autenticado
  fastify.delete("/api/leads/:id", auth, async (req, reply) => {
    await prisma.lead.delete({ where: { id: req.params.id } });
    fastify.io?.emit("lead:deleted", { id: req.params.id });
    return reply.code(204).send();
  });

  // Messages — list
  fastify.get("/api/leads/:id/messages", auth, async (req) => {
    return prisma.message.findMany({
      where: { leadId: req.params.id },
      orderBy: { criadoEm: "asc" },
    });
  });

  // Messages — send text
  fastify.post("/api/leads/:id/messages", auth, async (req, reply) => {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado" });

    const { texto, tipo = "atendente", canal } = req.body;
    const isWhatsApp = lead.canal === 'whatsapp' && !!lead.telefone;
    const isNonWhatsApp = lead.canal !== 'whatsapp' && !!lead.mercadophoneTicketUuid;
    const isOutbound = tipo === "atendente" && (isWhatsApp || isNonWhatsApp);

    // Apply attendant signature if enabled
    let textoEnvio = texto;
    if (isOutbound) {
      textoEnvio = await applySignature(texto, req.user.id);
    }

    // Envia primeiro e captura o wid — garante que a mensagem persistida
    // tenha externalMessageId antes que o eco do MercadoPhone chegue.
    let extId = null;
    let deliveryStatus = null;
    if (isOutbound) {
      if (isNonWhatsApp) {
        extId = await sendTextViaTicket({ ticketId: lead.mercadophoneTicketUuid, text: textoEnvio })
          .catch(err => { console.error("[leads:messages] sendTextViaTicket error:", err.message); return null; });
      } else {
        extId = await sendTextMessage({ to: lead.telefone, text: textoEnvio, canal: lead.canalMensagem || "whatsapp" })
          .catch(err => { console.error("[leads:messages] sendTextMessage error:", err.message); return null; });
      }
      deliveryStatus = extId ? "sent" : "failed";
    }

    const msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo,
        texto: textoEnvio,
        canal: canal || lead.canalMensagem,
        deliveryStatus,
        ...(extId ? { externalMessageId: extId } : {}),
      },
    });

    await prisma.lead.update({ where: { id: lead.id }, data: { atualizadoEm: new Date() } });
    fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);

    return reply.code(201).send(msg);
  });

  // Messages — upload media (photo / file / audio)
  fastify.post("/api/leads/:id/upload", auth, async (req, reply) => {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado" });

    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Arquivo não enviado" });

    const isAudioWebm = (part.mimetype || "").startsWith("audio/") && /webm/i.test(part.mimetype || "");

    let ext = path.extname(part.filename || "file").replace(/[^a-z0-9.]/gi, "") || ".bin";
    // Normalize audio/webm blob sent by MediaRecorder (filename may be empty or .webm)
    if (isAudioWebm) ext = ".webm";
    const tmpName = `${randomUUID()}${ext}`;
    const tmpPath = path.join(UPLOADS_DIR, tmpName);
    await pipeline(part.file, createWriteStream(tmpPath));

    let safeName = tmpName;
    let filePath = tmpPath;

    // Transcode webm audio → mp3 (WhatsApp/MercadoPhone hub-message accepts audio/mp3)
    if (isAudioWebm) {
      const mp3Name = tmpName.replace(/\.webm$/, ".mp3");
      const mp3Path = path.join(UPLOADS_DIR, mp3Name);
      try {
        await transcodeWebmToMp3(tmpPath, mp3Path);
        unlinkSync(tmpPath);
        safeName = mp3Name;
        filePath = mp3Path;
        console.log(`[leads:upload] transcoded ${tmpName} → ${mp3Name}`);
      } catch (err) {
        console.warn("[leads:upload] ffmpeg transcode failed, using original webm:", err.message);
      }
    }

    const publicUrl = `${UPLOADS_URL}/${safeName}`;
    const caption = part.fields?.caption?.value || part.filename || "arquivo";

    const canSendMedia = !!lead.telefone || (lead.canal !== 'whatsapp' && !!lead.mercadophoneTicketUuid);
    const msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo: "atendente",
        texto: caption,
        canal: lead.canalMensagem,
        mediaUrl: publicUrl,
        deliveryStatus: canSendMedia ? "pending" : null,
      },
    });

    await prisma.lead.update({ where: { id: lead.id }, data: { atualizadoEm: new Date() } });
    fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);

    if (canSendMedia) {
      sendMediaMessage({
        to: lead.telefone,
        mediaUrl: publicUrl,
        caption,
        canal: lead.canal || "whatsapp",
        ticketId: lead.canal !== 'whatsapp' ? lead.mercadophoneTicketUuid : null,
      }).then(async (extId) => {
        const updated = await prisma.message.update({
          where: { id: msg.id },
          data: { deliveryStatus: extId ? "sent" : "failed" },
        });
        fastify.io?.to(`lead:${lead.id}`).emit("message:updated", updated);
      }).catch(console.error);
    }

    return reply.code(201).send(msg);
  });

  // Assign lead — also marks the pending QueueAssignment as assumed
  fastify.post("/api/leads/:id/assign", auth, async (req, reply) => {
    const { atendenteId } = req.body;
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { atendenteId, statusPipeline: "em_atendimento", biaAtiva: false },
      include: { atendente: { select: { id: true, nome: true } } },
    });
    await prisma.queueAssignment.updateMany({
      where: { leadId: req.params.id, assumidoEm: null },
      data: { assumidoEm: new Date() },
    });
    // Alguém assumiu → encerra o re-alerta de handoff pendente (fire-and-forget)
    clearHandoffPendente(lead.id).catch(() => {});

    fastify.io?.emit("lead:updated", lead);
    fastify.io?.emit("lead:assigned", { leadId: lead.id, atendenteId });

    // Notify n8n to pause BIA for this lead
    fireN8nBia({ telefone: lead.telefone, leadId: lead.id, userId: atendenteId, status: "open" });

    return lead;
  });

  // Transfer lead to another atendente (keeps biaAtiva=false, registers internal note)
  fastify.post("/api/leads/:id/transferir", auth, async (req, reply) => {
    const { atendenteId: novoId } = req.body ?? {};
    if (!novoId) return reply.code(400).send({ error: "atendenteId obrigatório" });

    const current = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { atendente: { select: { nome: true } } },
    });
    if (!current) return reply.code(404).send({ error: "Lead não encontrado" });

    const novoAtendente = await prisma.user.findUnique({
      where: { id: novoId },
      select: { nome: true },
    });
    if (!novoAtendente) return reply.code(404).send({ error: "Atendente não encontrado" });

    const anteriorNome = current.atendente?.nome ?? "sem dono";
    const novoNome = novoAtendente.nome;

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { atendenteId: novoId, biaAtiva: false, statusPipeline: "em_atendimento" },
      include: { atendente: { select: { id: true, nome: true } } },
    });

    const msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo: "interno",
        texto: `🔁 Transferido de ${anteriorNome} para ${novoNome}`,
        canal: lead.canalMensagem,
      },
    });

    // Transferido para um dono → encerra o re-alerta de handoff pendente
    clearHandoffPendente(lead.id).catch(() => {});

    fastify.io?.emit("lead:updated", lead);
    fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);

    console.log(`[transfer] lead=${lead.id} "${lead.nome}" de="${anteriorNome}" para="${novoNome}"`);
    dispatchPushToUser(novoId, {
      title: "Atendimento transferido para você",
      body: lead.nome || lead.telefone || "Novo atendimento",
      url: `/chats?selected=${lead.id}`,
    }).catch(() => {});

    return lead;
  });

  // Unassign lead — returns lead to queue and re-enables BIA
  fastify.post("/api/leads/:id/unassign", auth, async (req, reply) => {
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { atendenteId: null, statusPipeline: "aguardando", biaAtiva: true },
      include: { atendente: { select: { id: true, nome: true } } },
    });
    fastify.io?.emit("lead:updated", lead);

    // Notify n8n to resume BIA for this lead
    fireN8nBia({ telefone: lead.telefone, leadId: lead.id, userId: null, status: "pending" });

    // Internal note
    const msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo: "interno",
        texto: "🔄 Atendimento devolvido para fila — Bia reativada",
        canal: lead.canalMensagem,
      },
    });
    fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);

    return lead;
  });

  // Status update — handles "perdido" lifecycle specially
  fastify.post("/api/leads/:id/status", auth, async (req, reply) => {
    const { status, motivo_perda } = req.body;

    // 'convertido' passa pela fonte única da regra (mesma usada no registro de venda)
    if (status === "convertido") {
      return finalizeConvertido(fastify, req.params.id);
    }

    const updateData = { statusPipeline: status };

    if (status === "perdido") {
      updateData.motivoPerda = motivo_perda || null;
      updateData.dataPerda = new Date();
      await prisma.queueAssignment.deleteMany({ where: { leadId: req.params.id } });
    }

    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: updateData });
    fastify.io?.emit("lead:updated", lead);
    await fireWebhook("lead.status_changed", { leadId: lead.id, status });

    if (status === "perdido") {
      await fireWebhook("lead.perdido", {
        lead_id: lead.id,
        telefone: lead.telefone,
        nome: lead.nome,
        interesse: lead.interesse,
        modelo_desejado: lead.modeloDesejado,
        faixa_investimento: lead.faixaInvestimento,
        motivo_perda: lead.motivoPerda,
        data_perda: lead.dataPerda,
      });
    }

    return lead;
  });

  // Toggle BIA
  fastify.post("/api/leads/:id/bia", auth, async (req, reply) => {
    const current = await prisma.lead.findUnique({
      where: { id: req.params.id },
      select: { biaAtiva: true, telefone: true, canalMensagem: true },
    });
    const biaAtiva = !current.biaAtiva;
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: { biaAtiva } });

    await fireWebhook("bia.toggled", { leadId: lead.id, biaAtiva, telefone: current.telefone, canal: current.canalMensagem });

    if (!biaAtiva) {
      const msg = await prisma.message.create({
        data: {
          leadId: lead.id,
          tipo: "interno",
          texto: "🤖 Bia desativada — atendimento humano assumido",
          canal: current.canalMensagem,
        },
      });
      fastify.io?.to(`lead:${lead.id}`).emit("message:new", msg);
    }

    fastify.io?.emit("lead:updated", { id: lead.id, biaAtiva });
    return { biaAtiva };
  });

  // AI suggestions
  fastify.get("/api/leads/:id/suggestions", auth, async (req) => {
    const suggestions = await getSuggestions(req.params.id);
    return { suggestions };
  });
}
