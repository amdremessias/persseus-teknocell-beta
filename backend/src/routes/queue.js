import prisma from '../lib/prisma.js';
import { activeEligibleQueues, pickAgentFromQueue, pickQueue } from '../services/queue.js';

export default async function queueRoutes(fastify) {
  // Selecionar próximo agente disponível (workflow BIA_CRM_FULL_handoff)
  // Strategy: segue a fila configurada (round_robin por padrão ou least_busy).
  // Aceita ?queueId= para forçar uma fila específica.
  fastify.get('/api/queue/next-available-agent', async (req, reply) => {
    const secret = process.env.BIA_SECRET;
    if (secret && req.headers['x-bia-secret'] !== secret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { queueId } = req.query;

    let agent = null;
    let chosenQueueId = null;

    if (queueId) {
      const queue = await prisma.attendanceQueue.findUnique({
        where: { id: queueId },
        include: { team: true },
      }).catch(() => null);
      if (queue && queue.ativa) {
        const picked = await pickAgentFromQueue(queue);
        if (picked) {
          agent = picked;
          chosenQueueId = queue.id;
        }
      }
    } else {
      const queues = await activeEligibleQueues();
      const queue = await pickQueue(queues);
      if (queue) {
        const picked = await pickAgentFromQueue(queue);
        if (picked) {
          agent = picked;
          chosenQueueId = queue.id;
        }
      }
    }

    if (!agent) {
      return { agente_id: null, agente_nome: null, queue_id: null };
    }

    const agente = await prisma.user.findUnique({
      where: { id: agent.userId },
      select: { id: true, nome: true },
    });
    if (!agente) return { agente_id: null, agente_nome: null, queue_id: null };

    return { agente_id: agente.id, agente_nome: agente.nome, queue_id: chosenQueueId };
  });
}