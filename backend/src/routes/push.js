import prisma from "../lib/prisma.js";

export default async function pushRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] };

  fastify.get("/api/push/public-key", async (_req, reply) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return reply.code(503).send({ error: "Push não configurado" });
    return { publicKey: key };
  });

  fastify.post("/api/push/subscribe", auth, async (req, reply) => {
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.code(400).send({ error: "Payload inválido" });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
    });

    return reply.code(201).send({ ok: true });
  });

  fastify.post("/api/push/unsubscribe", auth, async (req, reply) => {
    const { endpoint } = req.body ?? {};
    if (!endpoint) return reply.code(400).send({ error: "endpoint obrigatório" });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    });

    return { ok: true };
  });
}
