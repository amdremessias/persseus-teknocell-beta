import prisma from '../lib/prisma.js';
import { sendTextMessage } from './outgoing.js';
import {
  mercadophoneGetApprovedTemplateByName,
  mercadophoneSendTemplateByName,
  renderTemplateBody,
} from '../channels/whatsapp/mercadophone-api.js';

// ── Constants ────────────────────────────────────────────────────────────────

const FU_DEFAULTS = {
  followup_fu1: 'Oi, [nome]! 😊 Ficou alguma dúvida? Qualquer coisa é só me chamar 👍',
  followup_fu2: 'Oi, [nome]! Se você achou um preço melhor em outro lugar, me fala — deixa eu tentar melhorar aqui com meu chefe ou com o fornecedor 😉 Que acha?',
  followup_fu3: 'Oi, [nome]! Última passadinha 🙂 Se ainda tiver interesse, me chama que eu te ajudo a fechar do melhor jeito!',
  followup_fu4: 'Oi, [nome]! Passando pra avisar que essa semana consigo uma condição especial pra você 😉 Quer que eu veja?',
  followup_fu5: 'Oi, [nome]! O modelo que você viu está saindo bastante — se ainda tiver interesse me chama que eu garanto o seu 👍',
  followup_fu6: 'Oi, [nome]! Vou encerrar seu atendimento por aqui pra não te incomodar 🙂 Quando quiser, é só chamar — será um prazer te atender!',
};

// Settings não-texto criadas com default (upsert nunca sobrescreve valor do admin).
// Templates começam VAZIOS — serão preenchidos com o JSON do template aprovado na Meta.
const OTHER_DEFAULTS = {
  followup_apple_keywords: 'iphone,apple,macbook,watch,ipad,airpods',
  followup_offsets_hours: '1,12,23,72,120,168',
  // Templates resolvidos por NOME via API do MercadoPhone (WABA). Quando a Meta
  // aprovar, os disparos >24h começam sozinhos.
  followup_template_name: 'followup_retomada_1',
  followup_template_encerramento_name: 'followup_encerramento_1',
};

const APPLE_KEYWORDS_DEFAULT = OTHER_DEFAULTS.followup_apple_keywords;
// Offsets default (ms, a partir do abandono_ts) por estágio FU1..FU6.
const OFFSETS_DEFAULT_MS = [1, 12, 23, 72, 120, 168].map((h) => h * 60 * 60 * 1000);

const ABANDON_MIN_MS = 1 * 60 * 60 * 1000;   // 1h — min silence to trigger
const ABANDON_MAX_MS = 12 * 60 * 60 * 1000;  // 12h — anti-retroativo guard
const MIN_SPACING_MS = 2 * 60 * 60 * 1000;   // 2h min between consecutive dispatches

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDefaultTexts() {
  const defaults = { ...FU_DEFAULTS, ...OTHER_DEFAULTS };
  for (const [chave, valor] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { chave },
      create: { chave, valor },
      update: {},   // never overwrite an admin-customized value
    });
  }
}

async function getFuText(fuNumber, nome) {
  const key = `followup_fu${fuNumber}`;
  const row = await prisma.setting.findUnique({ where: { chave: key } });
  const template = row?.valor || FU_DEFAULTS[key] || '';
  return template.replace(/\[nome\]/gi, nome || '');
}

// Lê uma Setting direto do banco (sempre fresca, igual getFuText). Retorna null
// se ausente; "" se existir mas vazia.
async function readSetting(chave) {
  const row = await prisma.setting.findUnique({ where: { chave } });
  return row?.valor ?? null;
}

// Offsets (ms, a partir do abandono_ts) por estágio. Lê followup_offsets_hours
// ("1,12,23,72,120,168"); se ausente/inválida usa OFFSETS_DEFAULT_MS.
async function getOffsetsMs() {
  const raw = await readSetting('followup_offsets_hours');
  if (raw && raw.trim()) {
    const parts = raw.split(',').map((s) => Number(s.trim()));
    if (parts.length > 0 && parts.every((n) => Number.isFinite(n) && n > 0)) {
      return parts.map((h) => h * 60 * 60 * 1000);
    }
    console.warn(`[followup] followup_offsets_hours inválida ("${raw}") — usando default`);
  }
  return OFFSETS_DEFAULT_MS;
}

// Registra no histórico o template enviado. O envio direto pela Graph não gera eco
// do MercadoPhone; se um eco vier, o externalMessageId @unique deduplica.
async function registerTemplateMessage(number, template, variables, wid) {
  try {
    const lead = await prisma.lead.findFirst({
      where: { OR: [{ telefone: number }, { identifierCanal: number }], canal: 'whatsapp' },
      select: { id: true },
    });
    if (!lead) return;
    await prisma.message.create({
      data: {
        leadId: lead.id,
        tipo: 'bia',
        texto: renderTemplateBody(template, variables),
        canal: 'whatsapp',
        deliveryStatus: 'sent',
        ...(wid ? { externalMessageId: wid } : {}),
      },
    });
  } catch (err) {
    console.warn('[followup] falha ao registrar template no histórico:', err.message);
  }
}

// Keywords Apple (lowercase, sem vazios). Lê followup_apple_keywords.
async function getAppleKeywords() {
  const raw = await readSetting('followup_apple_keywords');
  const src = raw && raw.trim() ? raw : APPLE_KEYWORDS_DEFAULT;
  return src.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

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

// ── Public: called from ingestion when client sends a message ─────────────────

export async function stopFollowupForNumber(number) {
  try {
    const affected = await prisma.$executeRaw`
      UPDATE bia_followup
      SET status = 'respondido', updated_at = NOW()
      WHERE number = ${number} AND status = 'ativo'
    `;
    if (affected > 0) {
      console.log(`[followup] cliente respondeu — sequência encerrada para ${number}`);
    }
  } catch (err) {
    console.error('[followup] erro ao encerrar sequência por resposta do cliente:', err.message);
  }
}

// ── Main job (runs hourly) ────────────────────────────────────────────────────

export async function runFollowupJob() {
  console.log('[followup] iniciando job');
  try {
    await ensureDefaultTexts();
    await cancelClosedLeads();
    await detectAbandonedLeads();
    await dispatchPendingFollowups();
    console.log('[followup] job concluído');
  } catch (err) {
    console.error('[followup] erro fatal no job:', err.message);
  }
}

// ── Step 1: cancel follow-ups whose lead is now closed/lost ──────────────────

async function cancelClosedLeads() {
  try {
    const affected = await prisma.$executeRaw`
      UPDATE bia_followup bf
      SET status = 'concluido', updated_at = NOW()
      FROM leads l
      WHERE (bf.number = l.telefone OR bf.number = l.identifier_canal)
        AND bf.status = 'ativo'
        AND l.status_pipeline IN ('finalizado', 'fechado', 'perdido', 'concluido', 'arquivado')
    `;
    if (affected > 0) {
      console.log(`[followup] ${affected} follow-up(s) cancelados (lead fechado/perdido)`);
    }
  } catch (err) {
    console.error('[followup] erro em cancelClosedLeads:', err.message);
  }
}

// ── Step 2: detect newly abandoned conversations ──────────────────────────────
//
// Conditions:
//   - WhatsApp lead with a phone number
//   - Last non-internal message is from bia/atendente
//   - That message is ≥1h and ≤12h old (anti-retroativo)
//   - Lead is not closed and no human is currently attending
//   - Lead is Apple (metadata.intencao ou tags batem com followup_apple_keywords)
//
async function detectAbandonedLeads() {
  const now = new Date();
  const cutoffMin = new Date(now.getTime() - ABANDON_MIN_MS);  // 1h ago
  const cutoffMax = new Date(now.getTime() - ABANDON_MAX_MS);  // 12h ago

  // Só leads de produto Apple entram no follow-up.
  const keywords = await getAppleKeywords();
  const patterns = keywords.map((k) => `%${k}%`);
  const offsetsMs = await getOffsetsMs();

  const rows = await prisma.$queryRaw`
    SELECT
      l.id                                          AS lead_id,
      l.nome                                        AS lead_nome,
      COALESCE(l.telefone, l.identifier_canal)      AS number,
      last_msg.criado_em                            AS abandono_ts,
      last_client.criado_em                         AS last_customer_msg_ts
    FROM leads l
    JOIN LATERAL (
      SELECT tipo, criado_em
      FROM messages
      WHERE lead_id = l.id
        AND tipo != 'interno'
      ORDER BY criado_em DESC
      LIMIT 1
    ) last_msg ON true
    LEFT JOIN LATERAL (
      SELECT criado_em
      FROM messages
      WHERE lead_id = l.id
        AND tipo = 'cliente'
      ORDER BY criado_em DESC
      LIMIT 1
    ) last_client ON true
    WHERE COALESCE(l.telefone, l.identifier_canal) IS NOT NULL
      AND l.canal::text = 'whatsapp'
      AND last_msg.tipo::text IN ('bia', 'atendente')
      AND last_msg.criado_em < ${cutoffMin}
      AND last_msg.criado_em > ${cutoffMax}
      AND l.status_pipeline NOT IN ('finalizado', 'fechado', 'perdido', 'concluido', 'arquivado', 'pos_venda')
      AND NOT (l.atendente_id IS NOT NULL AND l.bia_ativa = false)
      AND (
        LOWER(COALESCE(l.metadata->>'intencao', '')) LIKE ANY(${patterns})
        OR EXISTS (
          SELECT 1 FROM unnest(l.tags) AS tg WHERE LOWER(tg) LIKE ANY(${patterns})
        )
      )
  `;

  if (rows.length === 0) {
    console.log('[followup] nenhum abandono novo detectado');
    return;
  }

  console.log(`[followup] ${rows.length} abandono(s) detectado(s)`);

  for (const row of rows) {
    try {
      const abandonoTs = new Date(row.abandono_ts);
      // last_customer_msg_ts may be null (lead never sent a message); use epoch as sentinel
      const lastCustomerTs = row.last_customer_msg_ts
        ? new Date(row.last_customer_msg_ts)
        : new Date(0);
      const nextFuAt = new Date(abandonoTs.getTime() + offsetsMs[0]); // FU1 no offset[0]

      // UPSERT: skip if already 'ativo' or 'concluido'; reset if 'respondido'
      await prisma.$executeRaw`
        INSERT INTO bia_followup
          (number, lead_nome, abandono_ts, last_customer_msg_ts,
           fu_stage, next_fu_at, status, created_at, updated_at)
        VALUES
          (${row.number}, ${row.lead_nome ?? null}, ${abandonoTs}, ${lastCustomerTs},
           0, ${nextFuAt}, 'ativo', NOW(), NOW())
        ON CONFLICT (number) DO UPDATE SET
          lead_nome            = EXCLUDED.lead_nome,
          abandono_ts          = EXCLUDED.abandono_ts,
          last_customer_msg_ts = EXCLUDED.last_customer_msg_ts,
          fu_stage             = 0,
          next_fu_at           = EXCLUDED.next_fu_at,
          status               = 'ativo',
          updated_at           = NOW()
        WHERE bia_followup.status NOT IN ('ativo', 'concluido')
      `;

      console.log(`[followup] detectado number=${row.number} nome="${row.lead_nome}" abandono=${abandonoTs.toISOString()} FU1=${nextFuAt.toISOString()}`);
    } catch (err) {
      console.error(`[followup] erro no upsert number=${row.number}:`, err.message);
    }
  }
}

// ── Step 3: fire pending follow-ups ──────────────────────────────────────────

async function dispatchPendingFollowups() {
  const now = new Date();

  const due = await prisma.$queryRaw`
    SELECT number, lead_nome, abandono_ts, last_customer_msg_ts, fu_stage
    FROM bia_followup
    WHERE status = 'ativo' AND next_fu_at <= ${now}
    ORDER BY next_fu_at ASC
  `;

  if (due.length === 0) return;
  console.log(`[followup] ${due.length} disparo(s) pendente(s)`);

  for (const row of due) {
    try {
      await dispatchOne(row, now);
    } catch (err) {
      // Never crash the job on a single lead failure
      console.error(`[followup] erro no dispatch number=${row.number}:`, err.message);
    }
  }
}

async function dispatchOne(row, now) {
  const { number, lead_nome, abandono_ts, last_customer_msg_ts, fu_stage } = row;
  const nome = lead_nome || number;
  const fuNumber = fu_stage + 1; // 1..6
  const offsetsMs = await getOffsetsMs();
  const totalStages = offsetsMs.length;

  // Silence window: reschedule to next 8h BRT
  if (isInSilenceWindow(now)) {
    const resumeAt = nextWindowOpenAt(now);
    console.log(`[followup] silêncio noturno — ${number} reagendado para ${resumeAt.toISOString()}`);
    await prisma.$executeRaw`
      UPDATE bia_followup
      SET next_fu_at = ${resumeAt}, updated_at = NOW()
      WHERE number = ${number} AND status = 'ativo'
    `;
    return;
  }

  // 24h window: text freely if client messaged within 24h; otherwise use template
  const lastClientTs = last_customer_msg_ts && Number(last_customer_msg_ts) > 0
    ? new Date(last_customer_msg_ts)
    : null;
  const hoursSinceClient = lastClientTs
    ? (now.getTime() - lastClientTs.getTime()) / 3_600_000
    : Infinity;
  const within24h = hoursSinceClient < 24;

  let sent = false;

  if (within24h) {
    const text = await getFuText(fuNumber, nome);
    console.log(`[followup] FU${fuNumber} texto livre → ${number}: "${text.slice(0, 80)}"`);
    const result = await sendTextMessage({ to: number, text, canal: 'whatsapp' });
    sent = result !== null;
    if (!sent) console.warn(`[followup] FU${fuNumber} sendText retornou null para ${number}`);
  } else {
    // Fora da janela 24h → template HSM aprovado na Meta (NÃO usa mais o template do quiz).
    // Último estágio usa o template de encerramento; demais usam o template padrão.
    const isLastStage = fuNumber >= totalStages;
    const nameKey = isLastStage ? 'followup_template_encerramento_name' : 'followup_template_name';
    const templateName = await readSetting(nameKey);
    const template = templateName ? await mercadophoneGetApprovedTemplateByName(templateName) : null;

    if (!template) {
      // Template ainda não aprovado (ou nome errado): não envia, só avança o estágio (skip).
      console.warn(`[followup] FU${fuNumber} >24h sem template aprovado (${nameKey}="${templateName}") — pulado para ${number}`);
      sent = false;
    } else {
      try {
        const primeiroNome = nome.split(' ')[0] || nome;
        const vars = { '1': primeiroNome };
        const wid = await mercadophoneSendTemplateByName({ to: number, template, variables: vars });
        sent = true;
        await registerTemplateMessage(number, template, vars, wid);
        console.log(`[followup] FU${fuNumber} template "${template?.name}" enviado para ${number}`);
      } catch (err) {
        console.warn(`[followup] FU${fuNumber} template falhou para ${number} — pulando: ${err.message}`);
        sent = false; // skip this FU but still advance the stage
      }
    }
  }

  // Advance stage regardless (skip counts as advanced)
  const newStage = fu_stage + 1;
  const abandonoTs = new Date(abandono_ts);

  if (newStage >= totalStages) {
    await prisma.$executeRaw`
      UPDATE bia_followup
      SET fu_stage = ${newStage}, status = 'concluido', updated_at = NOW()
      WHERE number = ${number}
    `;
    console.log(`[followup] FU${fuNumber} — sequência completa para ${number}`);
  } else {
    // next_fu_at = max(abandono_ts + offset do próximo estágio, now + 2h)
    const offsetMs = offsetsMs[newStage];
    const fromAbandono = new Date(abandonoTs.getTime() + offsetMs);
    const fromNow     = new Date(now.getTime() + MIN_SPACING_MS);
    const nextFuAt    = new Date(Math.max(fromAbandono.getTime(), fromNow.getTime()));

    await prisma.$executeRaw`
      UPDATE bia_followup
      SET fu_stage = ${newStage}, next_fu_at = ${nextFuAt}, updated_at = NOW()
      WHERE number = ${number}
    `;
    console.log(`[followup] FU${fuNumber} ${sent ? 'enviado' : 'pulado'} — próximo FU${fuNumber + 1} em ${nextFuAt.toISOString()} para ${number}`);
  }
}
