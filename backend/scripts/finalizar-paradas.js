import prisma from "../src/lib/prisma.js";

const THRESHOLD_H = 3;
const cutoff = new Date(Date.now() - THRESHOLD_H * 60 * 60 * 1000);

async function main() {
  const stale = await prisma.$queryRaw`
    SELECT l.id, l.nome, l.telefone, l.canal_mensagem
    FROM leads l,
    LATERAL (
      SELECT tipo, criado_em
      FROM messages
      WHERE lead_id = l.id
      ORDER BY criado_em DESC
      LIMIT 1
    ) last_msg
    WHERE l.atendente_id IS NOT NULL
      AND last_msg.tipo = 'cliente'
      AND last_msg.criado_em < ${cutoff}
  `;

  console.log(`[finalizar-paradas] ${stale.length} lead(s) encontrado(s) para finalizar`);

  let finalized = 0;
  for (const row of stale) {
    await prisma.lead.update({
      where: { id: row.id },
      data: { atendenteId: null, biaAtiva: true, statusPipeline: "aguardando" },
    });
    await prisma.message.create({
      data: {
        leadId: row.id,
        tipo: "interno",
        texto: "🧹 Atendimento finalizado automaticamente (conversa parada há +3h)",
        canal: row.canal_mensagem,
      },
    });
    console.log(`  ✓ lead=${row.id} "${row.nome || row.telefone || row.id}"`);
    finalized++;
  }

  console.log(`[finalizar-paradas] concluído — ${finalized} lead(s) finalizados`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
