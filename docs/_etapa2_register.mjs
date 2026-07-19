import fs from 'fs';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = JSON.parse(fs.readFileSync('/tmp/etapa2_data.json', 'utf8'));

let vendas = 0, leadsNovos = 0, seqs = 0, pulados = 0, erros = 0;
const criados = [];

for (const r of rows) {
  try {
    // 1. resolve/cria lead
    let leadId = r.lead_id;
    if (!leadId) {
      const ex = await p.lead.findUnique({
        where: { lead_canal_identifier_uk: { canal: 'whatsapp', identifierCanal: r.telefone } },
        select: { id: true },
      });
      if (ex) {
        leadId = ex.id;
      } else {
        const lead = await p.lead.create({
          data: {
            canal: 'whatsapp', identifierCanal: r.telefone, telefone: r.telefone, nome: r.nome,
            canalOrigem: 'retroativo', canalMensagem: 'whatsapp',
            statusPipeline: 'pos_venda', biaAtiva: false,
          },
          select: { id: true },
        });
        leadId = lead.id; leadsNovos++;
        criados.push(`lead ${lead.id} "${r.nome}" ${r.telefone}`);
      }
    }

    // 2. dedup: já existe venda retroativa pra esse lead nessa data (~1 dia)?
    const vts = new Date(r.venda_ts);
    const dup = await p.venda.findFirst({
      where: {
        leadId, registradoPor: 'retroativo',
        criadoEm: { gte: new Date(vts.getTime() - 864e5), lte: new Date(vts.getTime() + 864e5) },
      },
      select: { id: true },
    });
    if (dup) { pulados++; continue; }

    // 3. cria a venda com a data REAL do PDF
    const venda = await p.venda.create({
      data: {
        leadId, produto: r.produto, modelo: r.modelo, armazenamento: r.armazenamento || null,
        valor: r.valor, seminovo: r.seminovo, registradoPor: 'retroativo', criadoEm: vts,
      },
      select: { id: true },
    });
    vendas++;

    // 4. sequência pós-venda no estágio calculado (nunca envia retroativo)
    if (r.pv_stage !== null && r.next_pv_at) {
      await p.$executeRaw`
        INSERT INTO pos_venda_followup
          (venda_id, number, lead_id, produto, lead_nome, venda_ts, pv_stage, next_pv_at, status, postpone_count, created_at, updated_at)
        VALUES (${venda.id}, ${r.telefone}, ${leadId}, ${r.produto}, ${r.nome}, ${vts}, ${r.pv_stage}, ${new Date(r.next_pv_at)}, 'ativo', 0, NOW(), NOW())
        ON CONFLICT (venda_id) DO NOTHING`;
      seqs++;
    }
  } catch (e) {
    erros++; console.error(`ERRO "${r.nome}" ${r.telefone}:`, e.message);
  }
}

console.log(`\n=== ETAPA 2 GRAVADA ===`);
console.log(`vendas criadas:      ${vendas}`);
console.log(`leads novos criados: ${leadsNovos}`);
console.log(`sequências pós-venda:${seqs}`);
console.log(`pulados (já existia):${pulados}`);
console.log(`erros:               ${erros}`);
await p.$disconnect();
