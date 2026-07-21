import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';

// Estágios do funil (mesma derivação de antes: pos_venda por status; senão pelo
// estado_atendimento da Bia; senão 'novo').
const STAGES = ['novo', 'interessado', 'negociando', 'atendente', 'pos_venda', 'fechado', 'perdido'];

const STAGE_CASE = Prisma.sql`
  CASE
    WHEN l.status_pipeline = 'pos_venda' THEN 'pos_venda'
    WHEN l.status_pipeline = 'perdido' THEN 'perdido'
    WHEN l.status_pipeline IN ('convertido', 'fechado', 'finalizado', 'concluido') THEN 'fechado'
    WHEN (l.metadata->>'estado_atendimento') = 'novo' THEN 'novo'
    WHEN (l.metadata->>'estado_atendimento') IN ('qualificando', 'interessado') THEN 'interessado'
    WHEN (l.metadata->>'estado_atendimento') IN ('negociando', 'aguardando') THEN 'negociando'
    WHEN (l.metadata->>'estado_atendimento') = 'handoff_humano' THEN 'atendente'
    WHEN (l.metadata->>'estado_atendimento') = 'fechado' THEN 'fechado'
    WHEN (l.metadata->>'estado_atendimento') = 'perdido' THEN 'perdido'
    ELSE 'novo'
  END`;

// Mesmo filtro de inclusão de antes: não arquivado + com classificação da Bia
// ou atividade nos últimos 30 dias. (Requer o LATERAL "act".) Exclui conversas
// de assistência (marcadas pela Bia no campo legado `tags` ou pela tag "Assistência") —
// não são oportunidade de venda, não devem contar no funil.
const INCLUSION = Prisma.sql`
  l.status_pipeline NOT IN ('arquivado')
  AND NOT ('assistencia' = ANY(l.tags))
  AND NOT EXISTS (
    SELECT 1 FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id
    WHERE lt.lead_id = l.id AND t.nome = 'Assistência'
  )
  AND (
    (l.metadata->>'estado_atendimento') IS NOT NULL
    OR act.last_activity_at > NOW() - INTERVAL '30 days'
    OR l.atualizado_em > NOW() - INTERVAL '30 days'
  )`;

export default async function funilRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/funil — contagem por etapa (cards de resumo do topo)
  fastify.get('/api/funil', auth, async () => {
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT stage, COUNT(*)::int AS n FROM (
        SELECT ${STAGE_CASE} AS stage
        FROM leads l
        LEFT JOIN LATERAL (
          SELECT MAX(criado_em) AS last_activity_at FROM messages WHERE lead_id = l.id
        ) act ON true
        WHERE ${INCLUSION}
      ) t
      GROUP BY stage
    `);

    const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
    let total = 0;
    for (const r of rows) {
      if (counts[r.stage] !== undefined) counts[r.stage] = Number(r.n);
      total += Number(r.n);
    }

    return { counts, total };
  });

  // GET /api/funil/leads?stage=novo&search=&limit=30&offset=0 — lista paginada da etapa
  fastify.get('/api/funil/leads', auth, async (req) => {
    const stage = STAGES.includes(req.query.stage) ? req.query.stage : 'novo';
    const search = (req.query.search || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const searchFilter = search
      ? Prisma.sql`AND (f.nome ILIKE ${'%' + search + '%'} OR f.telefone ILIKE ${'%' + search + '%'})`
      : Prisma.empty;

    // Busca limit+1 pra saber se há próxima página.
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT * FROM (
        SELECT
          l.id, l.nome, l.telefone, l.metadata, l.atualizado_em,
          act.last_activity_at,
          lm.tipo       AS last_msg_tipo,
          lm.criado_em  AS last_msg_at,
          ${STAGE_CASE} AS stage
        FROM leads l
        LEFT JOIN LATERAL (
          SELECT MAX(criado_em) AS last_activity_at FROM messages WHERE lead_id = l.id
        ) act ON true
        LEFT JOIN LATERAL (
          SELECT tipo, criado_em FROM messages
          WHERE lead_id = l.id AND tipo != 'interno'
          ORDER BY criado_em DESC LIMIT 1
        ) lm ON true
        WHERE ${INCLUSION}
      ) f
      WHERE f.stage = ${stage}
      ${searchFilter}
      ORDER BY COALESCE(f.last_activity_at, f.atualizado_em) DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => {
      const meta = r.metadata ?? {};
      return {
        id: r.id,
        nome: r.nome,
        telefone: r.telefone,
        biaScore: meta.lead_score != null ? Number(meta.lead_score) : null,
        biaIntencao: meta.intencao ?? null,
        origem: meta.origem ?? null,
        lastContactAt: (r.last_activity_at || r.atualizado_em)?.toISOString?.() ?? null,
        lastMsgTipo: r.last_msg_tipo ?? null,
        lastMsgAt: r.last_msg_at?.toISOString?.() ?? null,
      };
    });

    return { stage, items, hasMore };
  });
}
