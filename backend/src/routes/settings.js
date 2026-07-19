import prisma from "../lib/prisma.js";

export default async function settingsRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get("/api/settings", auth, async () => {
    const settings = await prisma.setting.findMany();
    return Object.fromEntries(settings.map((s) => [s.chave, s.valor]));
  });

  fastify.put("/api/settings", auth, async (req) => {
    if (req.user.nivel !== "admin") throw { statusCode: 403, message: "Acesso negado" };
    const updates = Object.entries(req.body).map(([chave, valor]) =>
      prisma.setting.upsert({ where: { chave }, update: { valor: String(valor) }, create: { chave, valor: String(valor) } })
    );
    await Promise.all(updates);
    return { ok: true };
  });

  // Channels
  fastify.get("/api/channels", auth, async () => prisma.channelConfig.findMany());

  fastify.put("/api/channels/:canal", auth, async (req) => {
    if (req.user.nivel !== "admin") throw { statusCode: 403, message: "Acesso negado" };
    return prisma.channelConfig.upsert({
      where: { canal: req.params.canal },
      update: req.body,
      create: { canal: req.params.canal, ...req.body },
    });
  });

  // Templates
  fastify.get("/api/templates", auth, async () => prisma.template.findMany({ orderBy: { nome: "asc" } }));

  fastify.post("/api/templates", auth, async (req, reply) => {
    const t = await prisma.template.create({ data: req.body });
    return reply.code(201).send(t);
  });

  fastify.delete("/api/templates/:id", auth, async (req) => {
    await prisma.template.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  // Webhooks
  fastify.get("/api/webhooks", auth, async () => prisma.webhookConfig.findMany());

  fastify.post("/api/webhooks", auth, async (req, reply) => {
    const w = await prisma.webhookConfig.create({ data: req.body });
    return reply.code(201).send(w);
  });

  fastify.delete("/api/webhooks/:id", auth, async (req) => {
    await prisma.webhookConfig.delete({ where: { id: req.params.id } });
    return { ok: true };
  });
}
