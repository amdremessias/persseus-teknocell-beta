import prisma from '../lib/prisma.js';

const PAGAMENTO_DEFAULT = {
  desconto_pix: '5% OFF',
  parcelado: 'até 12x',
  kit_protecao: 'capa + película + película da câmera',
  garantia_novo: '1 ano Apple + 6 meses loja',
  garantia_seminovo: '6 meses loja',
};

async function getPagamento() {
  const setting = await prisma.setting.findUnique({ where: { chave: 'catalogo_pagamento' } });
  if (setting) {
    try { return JSON.parse(setting.valor); } catch {}
  }
  return PAGAMENTO_DEFAULT;
}

export default async function catalogoIphoneRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── Público — consumido pelo site iphone.teknoscel.shop ────────────────────
  fastify.get('/api/catalogo-iphone', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');

    const [items, pagamento] = await Promise.all([
      prisma.iphoneStockItem.findMany({
        where: { ativo: true },
        orderBy: { ordem: 'asc' },
        select: { modelo: true, condicao: true, precoPix: true, observacao: true },
      }),
      getPagamento(),
    ]);

    return {
      novos_lacrados: items
        .filter(i => i.condicao === 'novo')
        .map(i => ({ modelo: i.modelo, preco_pix: i.precoPix, observacao: i.observacao })),
      seminovos: items
        .filter(i => i.condicao === 'seminovo')
        .map(i => ({ modelo: i.modelo, preco_pix: i.precoPix, observacao: i.observacao })),
      pagamento,
    };
  });

  // ── Admin: condições de pagamento ──────────────────────────────────────────

  fastify.get('/api/admin/catalogo-iphone/pagamento', auth, async () => {
    return getPagamento();
  });

  fastify.put('/api/admin/catalogo-iphone/pagamento', auth, async (req, reply) => {
    const { desconto_pix, parcelado, kit_protecao, garantia_novo, garantia_seminovo } = req.body ?? {};

    const valor = JSON.stringify({
      desconto_pix: desconto_pix ?? PAGAMENTO_DEFAULT.desconto_pix,
      parcelado: parcelado ?? PAGAMENTO_DEFAULT.parcelado,
      kit_protecao: kit_protecao ?? PAGAMENTO_DEFAULT.kit_protecao,
      garantia_novo: garantia_novo ?? PAGAMENTO_DEFAULT.garantia_novo,
      garantia_seminovo: garantia_seminovo ?? PAGAMENTO_DEFAULT.garantia_seminovo,
    });

    await prisma.setting.upsert({
      where: { chave: 'catalogo_pagamento' },
      create: { chave: 'catalogo_pagamento', valor },
      update: { valor },
    });

    console.log('[catalogo-iphone] pagamento atualizado');
    return reply.code(200).send(JSON.parse(valor));
  });

  // ── Admin CRUD de modelos (autenticado) ────────────────────────────────────

  fastify.get('/api/admin/catalogo-iphone', auth, async () => {
    return prisma.iphoneStockItem.findMany({
      orderBy: [{ condicao: 'asc' }, { ordem: 'asc' }],
    });
  });

  fastify.post('/api/admin/catalogo-iphone', auth, async (req, reply) => {
    const { modelo, condicao, precoPix, observacao, ativo, ordem } = req.body ?? {};

    if (!modelo?.trim()) return reply.code(400).send({ error: 'modelo obrigatorio' });
    if (!['novo', 'seminovo'].includes(condicao)) return reply.code(400).send({ error: 'condicao deve ser "novo" ou "seminovo"' });
    if (!Number.isInteger(Number(precoPix)) || Number(precoPix) <= 0) return reply.code(400).send({ error: 'precoPix deve ser inteiro positivo' });

    const item = await prisma.iphoneStockItem.create({
      data: {
        modelo: modelo.trim(),
        condicao,
        precoPix: Number(precoPix),
        observacao: observacao?.trim() || null,
        ativo: ativo ?? true,
        ordem: Number(ordem ?? 0),
      },
    });
    console.log(`[catalogo-iphone] criado id=${item.id} modelo="${item.modelo}"`);
    return reply.code(201).send(item);
  });

  fastify.patch('/api/admin/catalogo-iphone/:id', auth, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    const { modelo, condicao, precoPix, observacao, ativo, ordem } = req.body ?? {};

    const data = {};
    if (modelo !== undefined) data.modelo = modelo.trim();
    if (condicao !== undefined) {
      if (!['novo', 'seminovo'].includes(condicao)) return reply.code(400).send({ error: 'condicao deve ser "novo" ou "seminovo"' });
      data.condicao = condicao;
    }
    if (precoPix !== undefined) data.precoPix = Number(precoPix);
    if (observacao !== undefined) data.observacao = observacao?.trim() || null;
    if (ativo !== undefined) data.ativo = Boolean(ativo);
    if (ordem !== undefined) data.ordem = Number(ordem);

    try {
      const item = await prisma.iphoneStockItem.update({ where: { id }, data });
      console.log(`[catalogo-iphone] atualizado id=${item.id}`);
      return item;
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'item nao encontrado' });
      throw err;
    }
  });

  fastify.delete('/api/admin/catalogo-iphone/:id', auth, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    try {
      await prisma.iphoneStockItem.delete({ where: { id } });
      console.log(`[catalogo-iphone] deletado id=${id}`);
      return { ok: true };
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'item nao encontrado' });
      throw err;
    }
  });
}
