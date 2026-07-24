import prisma from '../lib/prisma.js';
import { sendTextMessage } from './outgoing.js';
import {
  mercadophoneGetApprovedTemplateByName,
  mercadophoneSendTemplateByName,
  renderTemplateBody,
} from '../channels/whatsapp/mercadophone-api.js';

// ── Pós-venda automático (espelha services/followup.js) ───────────────────────
//
// Gatilho: registro de venda (tabela vendas) de produto Apple. Sequência:
//   PV1 — 1 dia   · PV2 — 30 dias · PV3 — 90 dias · PV4 — 6 meses (só iphone)
// Mesma mecânica dual do follow-up: texto livre dentro da janela de 24h,
// template HSM fora dela.

const PV_DEFAULTS = {
  posvenda_pv1: 'Oi, [nome]! 😊 Passando pra saber se deu tudo certo com seu aparelho. Qualquer dúvida é só me chamar!',
  posvenda_pv2: 'Oi, [nome]! Já faz um mês da sua compra 🎉 Como está o aparelho? Lembrando que você tem garantia com a gente — qualquer coisa é só chamar!',
  posvenda_pv3: 'Oi, [nome]! Tudo bem? Que tal um check-up gratuito no seu aparelho? Aproveita que temos películas e acessórios novos na loja 😉',
  posvenda_pv4: 'Oi, [nome]! Seu iPhone está valorizado no mercado de seminovos 📱 Se estiver pensando em fazer upgrade, avaliamos o seu na troca — quer saber quanto ele vale?',
};

// Settings não-texto criadas com default (upsert nunca sobrescreve valor do admin).
// Templates começam VAZIOS — preenchidos com o JSON do template aprovado na Meta.
const OTHER_DEFAULTS = {
  posvenda_offsets_hours: '24,720,2160,4320', // 1d, 30d, 90d, 180d
  // Templates resolvidos por NOME via API do MercadoPhone (WABA). Quando a Meta
  // aprovar, os disparos >24h começam sozinhos.
  posvenda_template_pv1_name: 'poscompra_d1_utility',
  posvenda_template_pv2_name: 'posvenda_30dias_1',
  posvenda_template_pv3_name: 'posvenda_90dias_1',
  posvenda_template_pv4_name: 'posvenda_upgrade_1',
};

// Pedido de avaliação no Google — envio ÚNICO extra quando o cliente responde
// positivamente ao PV1 (janela de 24h aberta → texto livre). Independente da
// sequência PV1..PV4, que continua normalmente.
const REVIEW_DEFAULTS = {
  // Link g.page/r/... da ficha da Teknos no Google. Editável em Configurações.
  // Se ficar vazio, nada é enviado (só loga) — reenvia quando o link for preenchido.
  google_review_url: 'https://g.page/r/CZcIIAR_BYBpEAE/review',
  // Link SOZINHO na própria linha — jeito mais confiável do WhatsApp deixar clicável.
  posvenda_review_msg:
    'Que bom que deu tudo certo, [nome]! 🎉\n\n' +
    'Posso te pedir um favorzinho rápido? Deixa uma avaliação da sua experiência com a Teknos aqui no Google (leva uns 30 segundinhos e ajuda MUITO a gente):\n\n' +
    '[link]\n\n' +
    'Muito obrigado! 🙏',
  posvenda_review_enabled: 'true', // kill switch sem deploy
};

// Offsets default (ms, a partir de venda_ts) por estágio PV1..PV4.
const OFFSETS_DEFAULT_MS = [24, 720, 2160, 4320].map((h) => h * 60 * 60 * 1000);

const APPLE_PRODUTOS = ['iphone', 'macbook', 'apple_watch', 'ipad', 'airpods'];

const MIN_SPACING_MS           = 2 * 60 * 60 * 1000;    // 2h min entre disparos
const ACTIVE_CONVERSATION_MS   = 48 * 60 * 60 * 1000;   // conversa ativa: cliente < 48h
const POSTPONE_MS              = 24 * 60 * 60 * 1000;    // adia +24h quando em conversa
const MAX_POSTPONES            = 7;                       // após 7 adiamentos, envia
const RESPONDIDO_REAGENDA_MS   = 48 * 60 * 60 * 1000;   // resposta em PV>1: adia +48h
const WITHIN_24H_MS            = 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDefaults() {
  const defaults = { ...PV_DEFAULTS, ...OTHER_DEFAULTS, ...REVIEW_DEFAULTS };
  for (const [chave, valor] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { chave },
      create: { chave, valor },
      update: {},   // never overwrite an admin-customized value
    });
  }
}

async function getPvText(pvNumber, nome) {
  const key = `posvenda_pv${pvNumber}`;
  const row = await prisma.setting.findUnique({ where: { chave: key } });
  const template = row?.valor || PV_DEFAULTS[key] || '';
  return template.replace(/\[nome\]/gi, nome || '');
}

async function readSetting(chave) {
  const row = await prisma.setting.findUnique({ where: { chave } });
  return row?.valor ?? null;
}

// Offsets (ms, a partir de venda_ts). Lê posvenda_offsets_hours; fallback default.
async function getOffsetsMs() {
  const raw = await readSetting('posvenda_offsets_hours');
  if (raw && raw.trim()) {
    const parts = raw.split(',').map((s) => Number(s.trim()));
    if (parts.length > 0 && parts.every((n) => Number.isFinite(n) && n > 0)) {
      return parts.map((h) => h * 60 * 60 * 1000);
    }
    console.warn(`[posvenda] posvenda_offsets_hours inválida ("${raw}") — usando default`);
  }
  return OFFSETS_DEFAULT_MS;
}

// Copiado de followup.js (não importado — não mexer no follow-up de abandono).
// Silence 20h–8h BRT (UTC-3): 20h BRT = 23h UTC, 8h BRT = 11h UTC
function isInSilenceWindow(utcDate) {
  const h = utcDate.getUTCHours();
  return h >= 23 || h < 11;
}

// Next 8h BRT (= 11h UTC) from or after fromDate
function nextWindowOpenAt(fromDate) {
  const d = new Date(fromDate);
  d.setUTCHours(11, 0, 0, 0);
  if (d <= fromDate) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Última mensagem do cliente para um número (whatsapp), ou null.
async function lastCustomerMsgTs(number) {
  const rows = await prisma.$queryRaw`
    SELECT MAX(m.criado_em) AS ts
    FROM messages m
    JOIN leads l ON l.id = m.lead_id
    WHERE (l.telefone = ${number} OR l.identifier_canal = ${number})
      AND m.tipo::text = 'cliente'
  `;
  const ts = rows?.[0]?.ts;
  return ts ? new Date(ts) : null;
}

function totalStagesFor(produto) {
  // PV4 (upgrade) só faz sentido pra iphone; demais produtos concluem no PV3.
  return produto === 'iphone' ? 4 : 3;
}

// ── Gatilho: chamado do POST /leads/:id/venda ─────────────────────────────────

export async function startPosVendaForVenda(venda, lead) {
  if (!APPLE_PRODUTOS.includes(venda.produto)) return; // não-Apple não entra
  // Pós-venda depende de texto/template WhatsApp. Lead de outro canal (ex: Instagram,
  // sem template) não entra na sequência — a venda é registrada normalmente.
  if (lead.canal && lead.canal !== 'whatsapp') {
    console.log(`[posvenda] venda ${venda.id} de lead canal=${lead.canal} — sequência WhatsApp pulada`);
    return;
  }
  const number = lead.telefone || lead.identifierCanal || null;
  if (!number) {
    console.warn(`[posvenda] venda ${venda.id} sem número — pós-venda não agendado`);
    return;
  }

  const offsetsMs = await getOffsetsMs();
  const vendaTs = venda.criadoEm ? new Date(venda.criadoEm) : new Date();
  const nextPvAt = new Date(vendaTs.getTime() + offsetsMs[0]);

  try {
    // Nova venda do mesmo cliente cancela sequências ativas antigas (evita duplicar).
    await prisma.$executeRaw`
      UPDATE pos_venda_followup
      SET status = 'cancelado', updated_at = NOW()
      WHERE number = ${number} AND status = 'ativo'
    `;
    await prisma.$executeRaw`
      INSERT INTO pos_venda_followup
        (venda_id, number, lead_id, produto, lead_nome, venda_ts,
         pv_stage, next_pv_at, status, postpone_count, created_at, updated_at)
      VALUES
        (${venda.id}, ${number}, ${lead.id}, ${venda.produto}, ${lead.nome ?? null}, ${vendaTs},
         0, ${nextPvAt}, 'ativo', 0, NOW(), NOW())
      ON CONFLICT (venda_id) DO NOTHING
    `;
    console.log(`[posvenda] sequência criada venda=${venda.id} number=${number} produto=${venda.produto} PV1=${nextPvAt.toISOString()}`);
  } catch (err) {
    console.error(`[posvenda] erro ao criar sequência venda=${venda.id}:`, err.message);
  }
}

// ── Public: chamado da ingestão quando o cliente manda mensagem ───────────────

export async function stopPosVendaForNumber(number) {
  try {
    // PV1 pendente (pv_stage=0): cliente já falou com a gente → encerra ('respondido').
    const closed = await prisma.$executeRaw`
      UPDATE pos_venda_followup
      SET status = 'respondido', updated_at = NOW()
      WHERE number = ${number} AND status = 'ativo' AND pv_stage = 0
    `;
    // Estágios seguintes (30d/90d/6m): conversa no meio NÃO cancela — só adia +48h.
    const reagenda = new Date(Date.now() + RESPONDIDO_REAGENDA_MS);
    const postponed = await prisma.$executeRaw`
      UPDATE pos_venda_followup
      SET next_pv_at = ${reagenda}, updated_at = NOW()
      WHERE number = ${number} AND status = 'ativo' AND pv_stage > 0 AND next_pv_at < ${reagenda}
    `;
    if (Number(closed) > 0 || Number(postponed) > 0) {
      console.log(`[posvenda] cliente respondeu ${number} — PV1 encerrado=${Number(closed)} reagendados=${Number(postponed)}`);
    }
  } catch (err) {
    console.error('[posvenda] erro em stopPosVendaForNumber:', err.message);
  }
}

// ── Pedido de avaliação no Google (positivo pós-PV1) ──────────────────────────

// case-insensitive, sem acento, colapsa espaços — pra casar padrões de texto.
function normalizeReview(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Texto exato do botão do template PV1 (poscompra_d1_utility). Match exato → positivo.
const PV1_BUTTON_NORM = 'esta tudo certo';

const REVIEW_POSITIVE = [
  'tudo certo', 'tudo bem', 'certinho', 'chegou', 'recebi', 'otimo',
  'perfeito', 'gostei', 'amei', 'funcionando', 'sim', 'ok', 'obrigad',
];
// Qualquer sinal de problema → NÃO é positivo (na dúvida, não manda).
const REVIEW_NEGATIVE = [
  'problema', 'defeito', 'nao ', 'ruim', 'ajuda', 'trocar', 'quebr',
  'travand', 'ainda nao', 'demora', 'reclama',
];

// Detecção conservadora de resposta positiva ao PV1.
function isPositiveReview(text) {
  const norm = normalizeReview(text);
  if (!norm) return false;
  if (norm === PV1_BUTTON_NORM) return true;             // clique do botão → positivo
  if (REVIEW_NEGATIVE.some((p) => norm.includes(p))) return false; // problema → não
  return REVIEW_POSITIVE.some((p) => norm.includes(p));  // positivo só se casar
}

// Chamado da ingestão quando o cliente manda uma mensagem (WhatsApp).
// Envia UMA vez o pedido de avaliação se: PV1 já foi enviado (pv_stage >= 1),
// a mensagem é claramente positiva, e o review ainda não foi pedido pra esse lead.
export async function maybeSendReviewRequest({ number, text, leadNome }) {
  try {
    if (!number) return;
    // Kill switch (default true). Null/ausente = habilitado.
    if ((await readSetting('posvenda_review_enabled')) === 'false') return;
    if (!isPositiveReview(text)) return;

    // Anti-abuso: no máximo 1 review por lead/número, ever.
    const already = await prisma.$queryRaw`
      SELECT 1 FROM pos_venda_followup
      WHERE number = ${number} AND review_requested_at IS NOT NULL
      LIMIT 1
    `;
    if (already.length > 0) return;

    // Elegível: existe sequência pós-venda desse número com PV1 já enviado.
    const eligible = await prisma.$queryRaw`
      SELECT venda_id, lead_id, lead_nome
      FROM pos_venda_followup
      WHERE number = ${number} AND pv_stage >= 1
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    if (eligible.length === 0) return;
    const row = eligible[0];

    // Link vazio → não envia e NÃO marca (reenvia quando o Danis preencher).
    const url = (await readSetting('google_review_url')) ?? REVIEW_DEFAULTS.google_review_url;
    if (!url || !url.trim()) {
      console.warn(`[posvenda] review positivo de ${number} mas google_review_url vazio — não enviado (será reenviado quando o link for configurado)`);
      return;
    }

    const nome = leadNome || row.lead_nome || number;
    const primeiroNome = nome.split(' ')[0] || nome;
    const template = (await readSetting('posvenda_review_msg')) || REVIEW_DEFAULTS.posvenda_review_msg;
    const msg = template
      .replace(/\[nome\]/gi, primeiroNome)
      .replace(/\[link\]/gi, url.trim());

    console.log(`[posvenda] review positivo → pedindo avaliação Google para ${number}: "${msg.slice(0, 80)}"`);
    const result = await sendTextMessage({ to: number, text: msg, canal: 'whatsapp' });
    if (result === null) {
      console.warn(`[posvenda] review sendText retornou null para ${number} — não marcado (tentará de novo)`);
      return;
    }

    // Marca pra NUNCA repetir pra esse lead.
    await prisma.$executeRaw`
      UPDATE pos_venda_followup
      SET review_requested_at = NOW(), updated_at = NOW()
      WHERE venda_id = ${row.venda_id}
    `;
    console.log(`[posvenda] pedido de avaliação Google enviado e marcado para ${number} (venda=${row.venda_id})`);
  } catch (err) {
    console.error('[posvenda] erro em maybeSendReviewRequest:', err.message);
  }
}

// ── Main job (hourly) ─────────────────────────────────────────────────────────

export async function runPosVendaJob() {
  console.log('[posvenda] iniciando job');
  try {
    await ensureDefaults();
    await cancelClosedLeads();
    await dispatchPending();
    console.log('[posvenda] job concluído');
  } catch (err) {
    console.error('[posvenda] erro fatal no job:', err.message);
  }
}

// ── Step 1: cancel sequências de leads perdidos/arquivados ────────────────────

async function cancelClosedLeads() {
  try {
    const affected = await prisma.$executeRaw`
      UPDATE pos_venda_followup pv
      SET status = 'cancelado', updated_at = NOW()
      FROM leads l
      WHERE (pv.number = l.telefone OR pv.number = l.identifier_canal)
        AND pv.status = 'ativo'
        AND l.status_pipeline IN ('perdido', 'arquivado')
    `;
    if (Number(affected) > 0) {
      console.log(`[posvenda] ${Number(affected)} sequência(s) canceladas (lead perdido/arquivado)`);
    }
  } catch (err) {
    console.error('[posvenda] erro em cancelClosedLeads:', err.message);
  }
}

// ── Step 2: dispara pós-vendas pendentes ──────────────────────────────────────

async function dispatchPending() {
  const now = new Date();

  const due = await prisma.$queryRaw`
    SELECT venda_id, number, lead_id, produto, lead_nome, venda_ts, pv_stage, postpone_count
    FROM pos_venda_followup
    WHERE status = 'ativo' AND next_pv_at <= ${now}
    ORDER BY next_pv_at ASC
  `;

  if (due.length === 0) return;
  console.log(`[posvenda] ${due.length} disparo(s) pendente(s)`);

  for (const row of due) {
    try {
      await dispatchOne(row, now);
    } catch (err) {
      console.error(`[posvenda] erro no dispatch venda=${row.venda_id}:`, err.message);
    }
  }
}

async function dispatchOne(row, now) {
  const { venda_id, number, lead_id, produto, lead_nome, venda_ts, pv_stage, postpone_count } = row;
  const nome = lead_nome || number;
  const pvNumber = pv_stage + 1; // 1..4
  const offsetsMs = await getOffsetsMs();
  const totalStages = totalStagesFor(produto);

  // Defensivo: estágio além do permitido pro produto → conclui sem enviar.
  if (pvNumber > totalStages) {
    await concludeRow(venda_id, pv_stage);
    return;
  }

  // Guard a: silêncio noturno → reagenda para a próxima janela (não conta adiamento).
  if (isInSilenceWindow(now)) {
    const resumeAt = nextWindowOpenAt(now);
    await reschedule(venda_id, resumeAt);
    console.log(`[posvenda] silêncio noturno — venda=${venda_id} reagendado para ${resumeAt.toISOString()}`);
    return;
  }

  const lastClientTs = await lastCustomerMsgTs(number);
  const msSinceClient = lastClientTs ? now.getTime() - lastClientTs.getTime() : Infinity;

  // Guard b: conversa ativa (cliente < 48h) → adia +24h, até MAX_POSTPONES.
  if (msSinceClient < ACTIVE_CONVERSATION_MS && Number(postpone_count) < MAX_POSTPONES) {
    const nextAt = new Date(now.getTime() + POSTPONE_MS);
    await prisma.$executeRaw`
      UPDATE pos_venda_followup
      SET next_pv_at = ${nextAt}, postpone_count = postpone_count + 1, updated_at = NOW()
      WHERE venda_id = ${venda_id} AND status = 'ativo'
    `;
    console.log(`[posvenda] conversa ativa — venda=${venda_id} adiado (${Number(postpone_count) + 1}/${MAX_POSTPONES}) para ${nextAt.toISOString()}`);
    return;
  }

  // ENVIO — dentro da janela de 24h manda texto livre; fora, template HSM.
  const within24h = msSinceClient < WITHIN_24H_MS;
  let sent = false;

  if (within24h) {
    const text = await getPvText(pvNumber, nome);
    console.log(`[posvenda] PV${pvNumber} texto livre → ${number}: "${text.slice(0, 80)}"`);
    const result = await sendTextMessage({ to: number, text, canal: 'whatsapp' });
    sent = result !== null;
    if (!sent) console.warn(`[posvenda] PV${pvNumber} sendText retornou null para ${number}`);
  } else {
    const nameKey = `posvenda_template_pv${pvNumber}_name`;
    const templateName = await readSetting(nameKey);
    const template = templateName ? await mercadophoneGetApprovedTemplateByName(templateName) : null;

    if (!template) {
      console.warn(`[posvenda] PV${pvNumber} >24h sem template aprovado (${nameKey}="${templateName}") — pulado para ${number}`);
      sent = false;
    } else {
      try {
        const primeiroNome = nome.split(' ')[0] || nome;
        const vars = { '1': primeiroNome };
        const wid = await mercadophoneSendTemplateByName({ to: number, template, variables: vars });
        sent = true;
        // Registra no histórico (envio direto pela Graph não ecoa; dedup por wid protege).
        if (lead_id) {
          await prisma.message.create({
            data: {
              leadId: lead_id,
              tipo: 'bia',
              texto: renderTemplateBody(template, vars),
              canal: 'whatsapp',
              deliveryStatus: 'sent',
              ...(wid ? { externalMessageId: wid } : {}),
            },
          }).catch((e) => console.warn('[posvenda] falha ao registrar template no histórico:', e.message));
        }
        console.log(`[posvenda] PV${pvNumber} template "${template?.name}" enviado para ${number}`);
      } catch (err) {
        console.warn(`[posvenda] PV${pvNumber} template falhou para ${number} — pulando: ${err.message}`);
        sent = false;
      }
    }
  }

  // Avança estágio (reseta postpone_count). Conclui em newStage >= totalStages.
  const newStage = pv_stage + 1;
  const vendaTs = new Date(venda_ts);

  if (newStage >= totalStages) {
    await concludeRow(venda_id, newStage);
    console.log(`[posvenda] PV${pvNumber} — sequência completa para ${number}`);
  } else {
    // next_pv_at = max(venda_ts + offset do próximo estágio, now + 2h)
    const fromVenda = new Date(vendaTs.getTime() + offsetsMs[newStage]);
    const fromNow   = new Date(now.getTime() + MIN_SPACING_MS);
    const nextPvAt  = new Date(Math.max(fromVenda.getTime(), fromNow.getTime()));

    await prisma.$executeRaw`
      UPDATE pos_venda_followup
      SET pv_stage = ${newStage}, next_pv_at = ${nextPvAt}, postpone_count = 0, updated_at = NOW()
      WHERE venda_id = ${venda_id} AND status = 'ativo'
    `;
    console.log(`[posvenda] PV${pvNumber} ${sent ? 'enviado' : 'pulado'} — próximo PV${pvNumber + 1} em ${nextPvAt.toISOString()} para ${number}`);
  }
}

async function concludeRow(vendaId, stage) {
  await prisma.$executeRaw`
    UPDATE pos_venda_followup
    SET pv_stage = ${stage}, status = 'concluido', updated_at = NOW()
    WHERE venda_id = ${vendaId}
  `;
}

async function reschedule(vendaId, at) {
  await prisma.$executeRaw`
    UPDATE pos_venda_followup
    SET next_pv_at = ${at}, updated_at = NOW()
    WHERE venda_id = ${vendaId} AND status = 'ativo'
  `;
}
