import prisma from '../lib/prisma.js';
import { getSetting } from '../lib/settings-cache.js';
import {
  mercadophoneContactByNumber,
  mercadophoneLatestTicketByContact,
  mercadophoneGetTicketMessages,
} from '../channels/whatsapp/mercadophone-api.js';

// ── Sync de mensagens do MercadoPhone ─────────────────────────────────────────
//
// Rede de segurança: o webhook continua sendo o canal principal (tempo real).
// Este job PUXA periodicamente as mensagens dos tickets via API e faz backfill
// SÓ do que falta — mensagens enviadas pelo painel/celular ou perdidas quando o
// webhook falha (servidor fora / deploy).
//
// Mensagens inseridas aqui são só histórico: NÃO disparam nenhum efeito
// colateral (follow-up, socket de nova mensagem, Bia/n8n). Dedup via
// Message.externalMessageId @unique + createMany skipDuplicates.

const SYNC_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000; // atividade nos últimos 3 dias
const MAX_LEADS_PER_CYCLE = 50;                   // trava pra não sobrecarregar a API
const MAX_PAGES = 5;                              // trava de segurança da paginação

// Loga a resposta bruta da API no primeiro fetch (confirmamos o formato pelos logs).
let logRawOnce = true;

export async function runMessageSyncJob() {
  // Kill switch sem deploy — admin seta message_sync_enabled="false" nas integrações.
  if (getSetting('message_sync_enabled', 'true') !== 'true') {
    console.log('[messageSync] desativado (message_sync_enabled != true) — pulando ciclo');
    return;
  }

  console.log('[messageSync] iniciando ciclo');
  const since = new Date(Date.now() - SYNC_LOOKBACK_MS);

  let leads;
  try {
    leads = await prisma.lead.findMany({
      where: {
        canal: 'whatsapp',
        atualizadoEm: { gte: since },
      },
      orderBy: { atualizadoEm: 'desc' },
      take: MAX_LEADS_PER_CYCLE,
      select: {
        id: true,
        telefone: true,
        identifierCanal: true,
        mercadophoneTicketUuid: true,
        metadata: true,
      },
    });
  } catch (err) {
    console.error('[messageSync] erro ao selecionar leads:', err.message);
    return;
  }

  console.log(`[messageSync] ${leads.length} lead(s) para verificar`);

  let totalInserted = 0;
  for (const lead of leads) {
    try {
      totalInserted += await syncLead(lead);
    } catch (err) {
      // Erro em um lead nunca derruba o job inteiro.
      console.error(`[messageSync] erro no lead ${lead.id}:`, err.message);
    }
  }

  console.log(`[messageSync] ciclo concluído — ${leads.length} lead(s) verificados, ${totalInserted} mensagem(ns) inserida(s)`);
}

// ── Resolve o ticketId e sincroniza as mensagens de um lead ───────────────────

async function syncLead(lead) {
  const number = lead.telefone || lead.identifierCanal;
  const meta = lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};

  // Prefere ticketId já conhecido (cache do sync ou vindo do webhook); senão busca.
  let ticketId = meta.mpTicketId || lead.mercadophoneTicketUuid || null;

  if (!ticketId) {
    if (!number) return 0;
    const contact = await mercadophoneContactByNumber(number);
    if (!contact) return 0;
    const ticket = await mercadophoneLatestTicketByContact({ contactId: contact.id });
    if (!ticket?.id) return 0;
    ticketId = String(ticket.id);

    // Salva pra não rebuscar toda vez.
    await prisma.lead.update({
      where: { id: lead.id },
      data: { metadata: { ...meta, mpTicketId: ticketId } },
    });
  }

  return syncTicketMessages(lead.id, ticketId);
}

async function syncTicketMessages(leadId, ticketId) {
  // Última mensagem já salva no CRM — usada pra decidir se vale paginar mais.
  const lastSaved = await prisma.message.findFirst({
    where: { leadId },
    orderBy: { criadoEm: 'desc' },
    select: { criadoEm: true },
  });
  const lastSavedTs = lastSaved?.criadoEm ?? new Date(0);

  let inserted = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES) {
    const data = await mercadophoneGetTicketMessages({ ticketId, pageNumber: page });

    if (logRawOnce) {
      console.log(`[messageSync] resposta bruta (ticket=${ticketId} page=${page}): ${JSON.stringify(data).slice(0, 500)}`);
      logRawOnce = false;
    }

    const messages = Array.isArray(data?.messages)
      ? data.messages
      : (Array.isArray(data) ? data : []);
    hasMore = Boolean(data?.hasMore);

    if (messages.length === 0) break;

    inserted += await insertMissing(leadId, messages);

    // Whaticket: page 1 = mais recentes; dentro da página as msgs vêm em ordem
    // crescente. Só pagina mais (mais antigas) se a mais antiga da página ainda
    // for mais nova que a última já salva — indício de gap a preencher.
    const oldestTs = messages.reduce((min, m) => {
      const t = parseTs(m.createdAt);
      if (t && (!min || t < min)) return t;
      return min;
    }, null);

    if (!oldestTs || oldestTs <= lastSavedTs) break;
    page += 1;
  }

  return inserted;
}

// ── Insere só o que falta (dedup por externalMessageId) ───────────────────────

async function insertMissing(leadId, messages) {
  const rows = [];

  for (const m of messages) {
    // Dedup TEM que usar o mesmo id do webhook (parser usa msg.wid), senão a
    // mesma mensagem entra duplicada. Fallback pro id numérico só se não houver wid.
    const externalMessageId = m.wid || (m.id != null ? String(m.id) : null);
    if (!externalMessageId) continue; // sem id não dá pra deduplicar com segurança

    const body = typeof m.body === 'string' ? m.body : '';
    const mediaUrl = m.mediaUrl || null;
    const texto = body || (mediaUrl ? '[mídia sincronizada]' : '');
    if (!texto && !mediaUrl) continue; // nada útil pra salvar

    rows.push({
      leadId,
      tipo: m.fromMe ? 'atendente' : 'cliente',
      texto,
      canal: 'whatsapp',
      externalMessageId,
      ...(mediaUrl ? { mediaUrl } : {}),
      // timestamp REAL da mensagem, não NOW() — histórico na ordem certa.
      criadoEm: parseTs(m.createdAt) || new Date(),
    });
  }

  if (rows.length === 0) return 0;

  const result = await prisma.message.createMany({
    data: rows,
    skipDuplicates: true, // ignora quem já existe (externalMessageId @unique)
  });

  if (result.count > 0) {
    console.log(`[messageSync] lead ${leadId}: +${result.count} mensagem(ns) inserida(s)`);
  }
  return result.count;
}

function parseTs(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
