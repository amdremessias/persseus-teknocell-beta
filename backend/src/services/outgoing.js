import prisma from "../lib/prisma.js";
import {
  mercadophoneFindOrCreateContact,
  mercadophoneOpenTicket,
  mercadophoneReopenTicket,
  mercadophoneSendMediaViaTicket,
  mercadophoneSendTextViaTicket,
} from "../channels/whatsapp/mercadophone-api.js";

async function getOutgoingConfig() {
  const rows = await prisma.setting.findMany({
    where: { chave: { in: ["outgoing_url", "outgoing_secret"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {
    url: map.outgoing_url || process.env.MERCADOPHONE_URL || process.env.OUTGOING_WEBHOOK_URL || "",
    token: map.outgoing_secret || process.env.MERCADOPHONE_TOKEN || process.env.OUTGOING_WEBHOOK_SECRET || "",
  };
}

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function sendTextMessage({ to, text, canal = "whatsapp" }) {
  const { url, token } = await getOutgoingConfig();
  if (!url || !token) {
    console.warn("[outgoing] MERCADOPHONE_URL / MERCADOPHONE_TOKEN não configurados — abortando envio");
    return null;
  }
  console.log(`[outgoing] enviando texto → ${to} (${canal}): "${String(text).slice(0, 60)}"`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(token) },
      body: JSON.stringify({ number: to, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[outgoing] text failed ${res.status}:`, JSON.stringify(body));
      return null;
    }
    // MercadoPhone retorna { response: { wid, id, ... }, ticket: {...} }
    const extId = body?.response?.wid || body?.wid || body?.id || body?.messageId || body?.message_id || null;
    console.log(`[outgoing] text ok → wid=${extId}`);
    return extId;
  } catch (err) {
    console.error("[outgoing] text error:", err.message);
    return null;
  }
}

// Envia texto pelo canal do ticket — para leads não-WhatsApp (Instagram, etc.)
// Retorna { success, externalMessageId }. IMPORTANTE: o hub-message não devolve
// wid, então externalMessageId vem null — NUNCA um placeholder como 'sent', que
// colidiria na constraint única de external_message_id e derrubaria o envio.
export async function sendTextViaTicket({ ticketId, text }) {
  console.log(`[outgoing] enviando texto via ticket ${ticketId}`);
  try {
    const result = await mercadophoneSendTextViaTicket({ ticketId, text });
    return { success: true, externalMessageId: result.externalMessageId || null };
  } catch (err) {
    console.error("[outgoing] sendTextViaTicket error:", err.message);
    return { success: false, externalMessageId: null };
  }
}

export async function sendMediaMessage({ to, mediaUrl, caption = "", canal = "whatsapp", ticketId = null }) {
  console.log(`[outgoing] enviando mídia → ${to || `ticket:${ticketId}`} (${canal}): ${mediaUrl}`);
  try {
    // Non-WhatsApp: use provided ticket directly (Instagram ticket, etc.)
    if (ticketId) {
      await mercadophoneSendMediaViaTicket({ ticketId, mediaPublicPath: mediaUrl, caption });
      return "sent";
    }
    const contact = await mercadophoneFindOrCreateContact({ name: to, number: to });

    // Always POST /tickets to get the current valid ticket for this contact.
    // We intentionally do NOT reuse tickets from a GET search: GET /tickets?status=open
    // can return stale tickets from ended conversations (Whaticket keeps them open indefinitely),
    // causing hub-message to silently fail on the wrong ticket.
    // POST /tickets returns the existing pending/open ticket or creates a fresh one — always valid.
    const ticket = await mercadophoneOpenTicket({ contactId: contact.id });
    console.log(`[outgoing] ticket id=${ticket.id} status=${ticket.status} contactId=${contact.id}`);

    if (ticket.status === "pending") {
      console.log(`[outgoing] ticket pending — reabrindo antes de enviar`);
      await mercadophoneReopenTicket(ticket.id);
    }

    await mercadophoneSendMediaViaTicket({ ticketId: ticket.id, mediaPublicPath: mediaUrl, caption });
    return "sent";
  } catch (err) {
    console.error("[outgoing] media error:", err.message);
    return null;
  }
}

// Backward-compatible alias
export async function sendMessage({ to, text }) {
  return sendTextMessage({ to, text });
}
