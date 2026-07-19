// Backfill de origem=ads a partir de referrals de anúncio CTWA já recebidos.
// Varre webhook_events (payload bruto), reusa o MESMO parser da ingestão pra
// extrair o referral e aplica a mesma captura (metadata.origem=ads + ads{} + tag
// "ads"), NUNCA sobrescrevendo origem existente. Idempotente.
//
// Uso:  node scripts/backfill-ads-origin.js          (aplica)
//       DRY_RUN=1 node scripts/backfill-ads-origin.js (só relata, não grava)
import prisma from '../src/lib/prisma.js';
import { parseWhatsAppWebhook } from '../src/channels/whatsapp/parser.js';

const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  // Pré-filtra no banco os eventos que carregam marcador de anúncio (evita
  // parsear os ~milhares de eventos orgânicos). Ordena do mais antigo p/ o mais
  // novo — a 1ª mensagem (com referral) é a que interessa.
  const candidatos = await prisma.$queryRaw`
    SELECT id FROM webhook_events
    WHERE payload::text ILIKE '%source_type%' OR payload::text ILIKE '%ctwa%'
    ORDER BY criado_em ASC
  `;
  console.log(`[backfill] eventos candidatos (com marcador de anúncio): ${candidatos.length}`);

  let comReferral = 0, capturados = 0, jaTinhaOrigem = 0, leadNaoEncontrado = 0, semReferral = 0;

  for (const { id } of candidatos) {
    const ev = await prisma.webhookEvent.findUnique({ where: { id } });
    if (!ev) continue;

    let parsed;
    try { parsed = parseWhatsAppWebhook(ev.payload); }
    catch { continue; }

    const ref = parsed.referral;
    if (!ref) { semReferral++; continue; }
    comReferral++;

    const identifier = parsed.lead?.identifier;
    const canal = parsed.lead?.detectedCanal || ev.canal;
    if (!identifier) { leadNaoEncontrado++; continue; }

    const lead = await prisma.lead.findUnique({
      where: { lead_canal_identifier_uk: { canal, identifierCanal: identifier } },
    });
    if (!lead) { leadNaoEncontrado++; continue; }

    const meta = lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};
    if (meta.origem) { jaTinhaOrigem++; continue; } // nunca sobrescreve

    const ads = {
      source_id:   ref.source_id ?? null,
      headline:    ref.headline ?? null,
      source_url:  ref.source_url ?? null,
      ctwa_clid:   ref.ctwa_clid ?? null,
      ...(ref.body ? { body: ref.body } : {}),
      ...(ref.source_type ? { source_type: ref.source_type } : {}),
      detectado_em: ev.criadoEm.toISOString(), // data real do clique, não a de hoje
      backfill: true,
    };
    const tags = Array.isArray(lead.tags) ? lead.tags : [];
    const nextTags = tags.includes('ads') ? tags : [...tags, 'ads'];

    console.log(`[backfill] lead=${lead.id} "${lead.nome}" source_id=${ads.source_id} url=${ads.source_url}`);
    if (!DRY_RUN) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { metadata: { ...meta, origem: 'ads', ads }, tags: nextTags },
      });
    }
    capturados++;
  }

  console.log('\n[backfill] ==== RESUMO ====');
  console.log(`  candidatos            : ${candidatos.length}`);
  console.log(`  com referral extraído : ${comReferral}`);
  console.log(`  origem=ads gravada    : ${capturados}${DRY_RUN ? ' (DRY_RUN — nada gravado)' : ''}`);
  console.log(`  lead já tinha origem  : ${jaTinhaOrigem}`);
  console.log(`  lead não encontrado   : ${leadNaoEncontrado}`);
  console.log(`  marcador s/ referral  : ${semReferral}`);
}

main()
  .catch((e) => { console.error('[backfill] erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
