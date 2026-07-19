import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';

// Separate key from the main queue round-robin to avoid interfering with assignToQueue
const HANDOFF_RR_KEY = 'teknos:handoff:round_robin_idx';

export default async function queueRoutes(fastify) {
  // ── Selecionar próximo agente disponível (workflow BIA_CRM_FULL_handoff) ──
  // Strategy: round-robin over active atendentes, same pattern as assignToQueue in services/queue.js.
  // Simple and stateless — no lastHandoffAt field needed.
  // TODO: evolve to weighted round-robin (by open lead count) if load becomes uneven.
  fastify.get('/api/queue/next-available-agent', async (req, reply) => {
    const secret = process.env.BIA_SECRET;
    if (secret && req.headers['x-bia-secret'] !== secret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const agentes = await prisma.user.findMany({
      where: { nivel: 'atendente', ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    if (!agentes.length) {
      return { agente_id: null, agente_nome: null };
    }

    const idx = await redis.incr(HANDOFF_RR_KEY);
    const agente = agentes[idx % agentes.length];

    return { agente_id: agente.id, agente_nome: agente.nome };
  });
}
