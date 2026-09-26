import prisma from "../lib/prisma.js";
import redis from "../lib/redis.js";

const QUEUE_KEY = "teknos:queue:round_robin_idx";
const FINALIZED = ["convertido", "perdido", "arquivado"];

function timeNowBRT() {
  return new Date();
}

async function isBusinessHours() {
  const setting = await prisma.setting.findUnique({ where: { chave: "horario_comercial" } });
  if (!setting) return true;
  const { inicio, fim, dias } = JSON.parse(setting.valor);
  const now = timeNowBRT();
  const day = now.getDay();
  if (!dias.includes(day)) return false;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fim.split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= h1 * 60 + m1 && minutes < h2 * 60 + m2;
}

// Checa se a fila está dentro do horário próprio (horario_inicio/fim/diasSemana).
function queueIsOpen(queue) {
  if (!queue.horarioInicio || !queue.horarioFim) return true;
  const now = timeNowBRT();
  const day = now.getDay();
  if (Array.isArray(queue.diasSemana) && queue.diasSemana.length && !queue.diasSemana.includes(day)) {
    return false;
  }
  const [h1, m1] = queue.horarioInicio.split(":").map(Number);
  const [h2, m2] = queue.horarioFim.split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= h1 * 60 + m1 && minutes < h2 * 60 + m2;
}

// Escolhe o atendente de uma fila conforme a estratégia configurada.
async function pickAgentFromQueue(queue) {
  const members = await prisma.queueMember.findMany({
    where: { queueId: queue.id, ativo: true, user: { ativo: true } },
    select: { userId: true, profile: true, prioridade: true },
    orderBy: [{ prioridade: "desc" }, { criadoEm: "asc" }],
  });
  // Prefere perfil 'atendente'; supervisor/gestor entram só se não houver atendentes.
  const atendentes = members.filter((m) => m.profile === "atendente");
  const pool = atendentes.length ? atendentes : members;
  if (!pool.length) return null;

  if (queue.estrategiaAtribuicao === "least_busy") {
    const ids = pool.map((m) => m.userId);
    const [open, leads] = await Promise.all([
      prisma.queueAssignment.groupBy({
        by: ["atendenteId"],
        where: { assumidoEm: null, atendenteId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["atendenteId"],
        where: { atendenteId: { in: ids }, statusPipeline: { notIn: FINALIZED } },
        _count: { _all: true },
      }),
    ]);
    const openMap = new Map(open.map((o) => [o.atendenteId, o._count._all]));
    const leadsMap = new Map(leads.map((l) => [l.atendenteId, l._count._all]));
    const limit = queue.maxLeadsPorAtendente || Infinity;
    // Candidatos que ainda não estouraram o limite de leads em aberto
    const withinLimit = pool.filter((m) => (leadsMap.get(m.userId) || 0) < limit);
    const candidatePool = withinLimit.length ? withinLimit : pool;
    candidatePool.sort((a, b) => (openMap.get(a.userId) || 0) - (openMap.get(b.userId) || 0));
    return candidatePool[0];
  }

  // round_robin (padrão) — round-robin por fila
  const idx = await redis.incr(`teknos:queue:${queue.id}:rr`);
  return pool[idx % pool.length];
}

// Filas ativas "elegíveis" para o lead (horário comercial global + horário da própria fila).
async function activeEligibleQueues() {
  const queues = await prisma.attendanceQueue.findMany({ where: { ativa: true } });
  return queues.filter(queueIsOpen);
}

// Escolhe a fila com menos volume de atribuições abertas (balanceia entre filas).
async function pickQueue(queues) {
  if (!queues.length) return null;
  if (queues.length === 1) return queues[0];

  const open = await prisma.queueAssignment.groupBy({
    by: ["queueId"],
    where: { assumidoEm: null, timeoutEm: { gt: new Date() }, queueId: { in: queues.map((q) => q.id) } },
    _count: { _all: true },
  });
  const openMap = new Map(open.map((o) => [o.queueId, o._count._all]));
  return [...queues].sort((a, b) => (openMap.get(a.id) || 0) - (openMap.get(b.id) || 0))[0];
}

export async function assignToQueue(leadId, opts = {}) {
  if (!(await isBusinessHours())) {
    return assignFallback(leadId);
  }

  const queues = await activeEligibleQueues();
  const queue = await pickQueue(queues);
  let agent = null;
  let queueId = null;

  if (queue) {
    const picked = await pickAgentFromQueue(queue);
    if (picked) {
      agent = { id: picked.userId };
      queueId = queue.id;
    }
  }

  // Fallback: sem fila/membros → qualquer usuário nível 'atendente' ativo
  if (!agent) {
    const result = await assignFallback(leadId);
    return result;
  }

  const timeoutAt = new Date(Date.now() + (queue.timeoutSegundos || 120) * 1000);
  const assignment = await prisma.queueAssignment.create({
    data: {
      leadId,
      atendenteId: agent.id,
      queueId,
      timeoutEm: timeoutAt,
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { atendenteId: agent.id, statusPipeline: "em_atendimento" },
  });

  return assignment;
}

// Fallback histórico: atendente global round-robin, sem fila
async function assignFallback(leadId) {
  const atendentes = await prisma.user.findMany({
    where: { nivel: "atendente", ativo: true },
    select: { id: true },
  });
  if (!atendentes.length) return null;

  const idx = await redis.incr(QUEUE_KEY);
  const atendente = atendentes[idx % atendentes.length];

  const timeoutAt = new Date(Date.now() + 2 * 60 * 1000);
  const assignment = await prisma.queueAssignment.create({
    data: { leadId, atendenteId: atendente.id, queueId: null, timeoutEm: timeoutAt },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { atendenteId: atendente.id, statusPipeline: "em_atendimento" },
  });

  return assignment;
}

export async function checkQueueTimeouts(io) {
  const expired = await prisma.queueAssignment.findMany({
    where: {
      assumidoEm: null,
      timeoutEm: { lt: new Date() },
    },
    include: { lead: true },
  });

  for (const a of expired) {
    await prisma.queueAssignment.delete({ where: { id: a.id } });
    const newAssignment = await assignToQueue(a.leadId);
    if (newAssignment) {
      io?.emit("queue:reassigned", {
        leadId: a.leadId,
        atendenteId: newAssignment.atendenteId,
        queueId: newAssignment.queueId,
      });
    }
  }
}

export { queueIsOpen, activeEligibleQueues, pickQueue, pickAgentFromQueue };