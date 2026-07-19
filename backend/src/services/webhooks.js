import prisma from "../lib/prisma.js";

export async function fireWebhook(evento, payload) {
  const configs = await prisma.webhookConfig.findMany({
    where: { ativo: true, eventos: { has: evento } },
  });

  for (const cfg of configs) {
    const headers = { "Content-Type": "application/json" };
    if (cfg.secret) headers["X-Webhook-Secret"] = cfg.secret;

    fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ evento, payload, timestamp: new Date().toISOString() }),
    }).catch((err) => console.error(`[webhook] ${cfg.url} failed:`, err.message));
  }
}
