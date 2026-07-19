import webpush from "web-push";
import prisma from "./prisma.js";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@teknoscel.shop";
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configurados — push desativado");
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

function mediaPreview(mediaUrl) {
  if (!mediaUrl) return null;
  const lower = mediaUrl.toLowerCase();
  if (/\.(ogg|mp3|opus|wav|m4a)/.test(lower)) return "🎤 Áudio";
  if (/\.(jpg|jpeg|png|gif|webp|heic)/.test(lower)) return "📷 Imagem";
  if (/\.(mp4|mov|avi|webm)/.test(lower)) return "🎥 Vídeo";
  return "📄 Documento";
}

export function buildPushPayload({ lead, message }) {
  const title = lead.nome || lead.telefone || lead.identifierCanal || "Nova mensagem";
  let body;
  if (message.mediaUrl) {
    body = mediaPreview(message.mediaUrl);
  } else {
    body = (message.texto || "").slice(0, 60) || "Nova mensagem";
  }
  return { title, body, url: `/chats?selected=${lead.id}` };
}

async function sendToSubscriptions(subscriptions, rawPayload) {
  ensureConfigured();
  if (!configured || subscriptions.length === 0) return;
  const dead = [];
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          rawPayload
        );
      } catch (err) {
        const status = err.statusCode ?? err.status;
        if (status === 404 || status === 410) {
          dead.push(sub.endpoint);
          console.log(`[push] subscription morta removida: ${sub.endpoint.slice(0, 60)}…`);
        } else {
          console.warn(`[push] erro ao enviar: ${err.message}`);
        }
      }
    })
  );
  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
  }
}

// Envia push para um usuário específico com payload customizado (ex: transferência)
export async function dispatchPushToUser(userId, customPayload) {
  ensureConfigured();
  if (!configured) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) {
      console.log(`[push] nenhuma subscription para userId=${userId}`);
      return;
    }
    console.log(`[push] enviando para ${subs.length} subscription(s) de userId=${userId}`);
    await sendToSubscriptions(subs, JSON.stringify(customPayload));
  } catch (err) {
    console.error("[push] erro em dispatchPushToUser:", err.message);
  }
}

// Envia push para TODOS os subscribers com payload customizado (ex: watchdog)
export async function dispatchPushBroadcast(customPayload) {
  ensureConfigured();
  if (!configured) return;
  try {
    const subs = await prisma.pushSubscription.findMany();
    if (subs.length === 0) {
      console.log(`[push] broadcast: nenhuma subscription cadastrada`);
      return;
    }
    console.log(`[push] broadcast para ${subs.length} subscription(s)`);
    await sendToSubscriptions(subs, JSON.stringify(customPayload));
  } catch (err) {
    console.error("[push] erro em dispatchPushBroadcast:", err.message);
  }
}

export async function dispatchPush({ lead, message }) {
  ensureConfigured();
  if (!configured) return;
  try {
    const subs = lead.atendenteId
      ? await prisma.pushSubscription.findMany({ where: { userId: lead.atendenteId } })
      : await prisma.pushSubscription.findMany();

    if (subs.length === 0) {
      console.log(`[push] nenhuma subscription para notificar (lead=${lead.id} atendenteId=${lead.atendenteId ?? 'null'})`);
      return;
    }
    console.log(`[push] enviando para ${subs.length} subscription(s) (lead=${lead.id})`);
    await sendToSubscriptions(subs, JSON.stringify(buildPushPayload({ lead, message })));
  } catch (err) {
    console.error("[push] erro inesperado em dispatchPush:", err.message);
  }
}
