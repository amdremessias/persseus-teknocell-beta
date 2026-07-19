import prisma from "../lib/prisma.js";
import redis from "../lib/redis.js";

const TIMEOUT_MS = 2 * 60 * 1000; // 2 min
const QUEUE_KEY = "teknos:queue:round_robin_idx";

async function isBusinessHours() {
  const setting = await prisma.setting.findUnique({ where: { chave: "horario_comercial" } });
  if (!setting) return true;
  const { inicio, fim, dias } = JSON.parse(setting.valor);
  const now = new Date();
  const day = now.getDay();
  if (!dias.includes(day)) return false;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fim.split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= h1 * 60 + m1 && minutes < h2 * 60 + m2;
}

export async function assignToQueue(leadId) {
  if (!(await isBusinessHours())) return null;

  const atendentes = await prisma.user.findMany({
    where: { nivel: "atendente", ativo: true },
    select: { id: true },
  });
  if (!atendentes.length) return null;

  const idx = await redis.incr(QUEUE_KEY);
  const atendente = atendentes[idx % atendentes.length];

  const timeoutAt = new Date(Date.now() + TIMEOUT_MS);
  const assignment = await prisma.queueAssignment.create({
    data: {
      leadId,
      atendenteId: atendente.id,
      timeoutEm: timeoutAt,
    },
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
      io?.emit("queue:reassigned", { leadId: a.leadId, atendenteId: newAssignment.atendenteId });
    }
  }
}
