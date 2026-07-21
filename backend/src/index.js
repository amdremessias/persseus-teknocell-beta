import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { Server as SocketServer } from "socket.io";
import path from "path";
import { mkdirSync } from "fs";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import leadRoutes from "./routes/leads.js";
import chatRoutes from "./routes/chats.js";
import tagRoutes from "./routes/tags.js";
import noteRoutes from "./routes/notes.js";
import quickReplyRoutes from "./routes/quickReplies.js";
import publicRoutes from "./routes/public.js";
import statsRoutes from "./routes/stats.js";
import settingsRoutes from "./routes/settings.js";
import integrationRoutes from "./routes/integrations.js";
import contactRoutes from "./routes/contacts.js";
import webhookRoutes from "./routes/webhooks.js";
import catalogoIphoneRoutes from "./routes/catalogoIphone.js";
import conversationRoutes from "./routes/conversations.js";
import queueRoutes from "./routes/queue.js";
import pushRoutes from "./routes/push.js";
import followupRoutes from "./routes/followups.js";
import funilRoutes from "./routes/funil.js";
import configTaxasMaquininhaRoutes from "./routes/configTaxasMaquininha.js";
import configAvaliacaoIphoneRoutes from "./routes/configAvaliacaoIphone.js";
import vendaRoutes from "./routes/vendas.js";
import posvendaRoutes from "./routes/posvenda.js";
import wabaTemplateRoutes from "./routes/wabaTemplates.js";
import scheduledMessageRoutes from "./routes/scheduledMessages.js";
import { checkQueueTimeouts } from "./services/queue.js";
import { checkStaleLeads, scheduleFaxina } from "./services/watchdog.js";
import { checkPendingHandoffs, setHandoffIo } from "./services/handoffWatch.js";
import { runFollowupJob } from "./services/followup.js";
import { runMessageSyncJob } from "./services/messageSync.js";
import { runPosVendaJob } from "./services/posvenda.js";
import { runScheduledMessagesJob } from "./services/scheduledMessages.js";
import { setupIngestion } from "./core/ingestion.js";
import { setupOutbound } from "./core/outbound.js";
import { loadSettings } from "./lib/settings-cache.js";
import prisma from "./lib/prisma.js";

const fastify = Fastify({ logger: process.env.NODE_ENV !== "production" });

// Plugins
await fastify.register(fastifyCors, {
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
});

await fastify.register(fastifyCookie);
await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET || "change_me_secret" });

fastify.decorate("authenticate", async function (req, reply) {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Token inválido ou expirado" });
  }
});

// Socket.IO — fastify.server exists before listen(); attach now so io is available to routes
const io = new SocketServer(fastify.server, {
  cors: { origin: process.env.FRONTEND_URL || "*", credentials: true },
});
fastify.decorate("io", io);

// Socket.IO auth middleware runs at connection time (after listen), jwt is ready then
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Unauthorized"));
  try {
    const payload = fastify.jwt.verify(token);
    socket.user = payload;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.on("join:lead", (leadId) => socket.join(`lead:${leadId}`));
  socket.on("leave:lead", (leadId) => socket.leave(`lead:${leadId}`));
});

// Wire io into core modules
setupIngestion(io);
setupOutbound(io);

// Accept text/plain bodies as JSON (n8n sometimes sends wrong content-type)
fastify.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
  try { done(null, JSON.parse(body)); } catch { done(null, {}); }
});

// Accept application/x-www-form-urlencoded — axios usa esse CT por default em POST sem body,
// fazendo /api/auth/refresh quebrar com 415 (FST_ERR_CTP_INVALID_MEDIA_TYPE).
fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
  try { done(null, body ? Object.fromEntries(new URLSearchParams(body)) : {}); } catch { done(null, {}); }
});

// File uploads — 20 MB limit
await fastify.register(fastifyMultipart, { limits: { fileSize: 20 * 1024 * 1024 } });

// Serve uploaded files at /api/uploads/*
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
mkdirSync(UPLOADS_DIR, { recursive: true });
await fastify.register(fastifyStatic, {
  root: path.resolve(UPLOADS_DIR),
  prefix: "/api/uploads/",
  decorateReply: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".opus") || filePath.endsWith(".ogg")) {
      res.setHeader("Content-Type", "audio/ogg");
    }
  },
});

// Routes
await fastify.register(authRoutes);
await fastify.register(userRoutes);
await fastify.register(leadRoutes);
await fastify.register(chatRoutes);
await fastify.register(tagRoutes);
await fastify.register(noteRoutes);
await fastify.register(quickReplyRoutes);
await fastify.register(publicRoutes);
await fastify.register(statsRoutes);
await fastify.register(settingsRoutes);
await fastify.register(integrationRoutes);
await fastify.register(contactRoutes);
await fastify.register(webhookRoutes);
await fastify.register(pushRoutes);
await fastify.register(catalogoIphoneRoutes);
await fastify.register(conversationRoutes);
await fastify.register(queueRoutes);
await fastify.register(followupRoutes);
await fastify.register(funilRoutes);
await fastify.register(configTaxasMaquininhaRoutes);
await fastify.register(configAvaliacaoIphoneRoutes);
await fastify.register(vendaRoutes);
await fastify.register(posvendaRoutes);
await fastify.register(wabaTemplateRoutes);
await fastify.register(scheduledMessageRoutes);

// Health check
fastify.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

// Queue timeout checker every 30s
setInterval(() => checkQueueTimeouts(io), 30_000);

// Watchdog: leads aguardando resposta há +15 min — notifica a cada 5 min
setInterval(() => checkStaleLeads(), 5 * 60 * 1000);

// Handoff sem dono: re-alerta (banner + push) handoffs não assumidos a cada 5 min
setHandoffIo(io);
setInterval(() => checkPendingHandoffs(), 5 * 60 * 1000);

// Faxina diária às 06:00 BRT (09:00 UTC): devolve leads inativos para fila
scheduleFaxina();

// Follow-up engine: detects abandoned conversations and fires FU1/FU2/FU3
setTimeout(() => runFollowupJob(), 10_000);          // run shortly after startup
setInterval(() => runFollowupJob(), 60 * 60 * 1000); // then every hour

// Message sync: rede de segurança que puxa mensagens dos tickets do MercadoPhone
// e faz backfill do que o webhook não trouxe (painel/celular/deploy). Só adiciona.
setTimeout(() => runMessageSyncJob(), 30_000);          // primeiro ciclo após o boot
setInterval(() => runMessageSyncJob(), 10 * 60 * 1000); // depois a cada 10 min

// Pós-venda: sequência PV1..PV4 disparada pelo registro de venda (produtos Apple)
setTimeout(() => runPosVendaJob(), 20_000);          // run shortly after startup
setInterval(() => runPosVendaJob(), 60 * 60 * 1000); // then every hour

// Mensagens agendadas manualmente pelo atendente (botão de agendamento no chat)
setTimeout(() => runScheduledMessagesJob(io), 15_000);   // run shortly after startup
setInterval(() => runScheduledMessagesJob(io), 60_000);  // then every minute

// Settings cache: DB > process.env > default
await loadSettings();

// Garante a tag "Assistência" (usada pela seção dedicada de assistência/suporte)
await prisma.tag
  .upsert({ where: { nome: "Assistência" }, update: {}, create: { nome: "Assistência", cor: "#f43f5e" } })
  .catch((err) => console.error("[bootstrap] falha ao criar tag Assistência:", err.message));

// Start
const port = Number(process.env.PORT || 3001);
await fastify.listen({ port, host: "0.0.0.0" });
console.log(`[backend] Listening on :${port}`);
