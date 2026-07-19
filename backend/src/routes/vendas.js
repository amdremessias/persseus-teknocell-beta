import { z } from "zod";
import prisma from "../lib/prisma.js";
import { finalizeConvertido } from "../services/leadStatus.js";
import { startPosVendaForVenda } from "../services/posvenda.js";

const PRODUTOS = ["iphone", "macbook", "apple_watch", "ipad", "airpods", "acessorio", "conserto", "outro"];

const vendaSchema = z.object({
  produto: z.enum(PRODUTOS),
  modelo: z.string().trim().max(120).optional().nullable(),
  armazenamento: z.string().trim().max(40).optional().nullable(),
  valor: z.number().nonnegative().optional().nullable(),
  seminovo: z.boolean().optional(),
});

export default async function vendaRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // Registra a venda no momento da conversão e aplica ao lead o mesmo efeito
  // da finalização 'convertido' (via fonte única finalizeConvertido).
  fastify.post("/api/leads/:id/venda", auth, async (req, reply) => {
    const parsed = vendaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "dados inválidos", detalhes: parsed.error.flatten() });
    }
    const { produto, modelo, armazenamento, valor, seminovo } = parsed.data;

    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      select: { id: true, nome: true, telefone: true, identifierCanal: true, canal: true },
    });
    if (!lead) return reply.code(404).send({ error: "lead não encontrado" });

    const venda = await prisma.venda.create({
      data: {
        leadId: req.params.id,
        produto,
        modelo: modelo || null,
        armazenamento: armazenamento || null,
        valor: valor ?? null,
        seminovo: seminovo ?? false,
        registradoPor: req.user.id,
      },
    });

    // Mesmo efeito da finalização 'convertido' (não duplica a regra)
    await finalizeConvertido(fastify, req.params.id);

    // Gatilho pós-venda: só produtos Apple entram (a própria função filtra)
    await startPosVendaForVenda(venda, lead);

    return reply.code(201).send({ ...venda, valor: venda.valor != null ? Number(venda.valor) : null });
  });

  // Lista vendas com filtros opcionais ?days=30 e ?produto=iphone.
  fastify.get("/api/vendas", auth, async (req) => {
    const days = req.query.days ? parseInt(req.query.days, 10) : null;
    const produto = req.query.produto || null;

    const where = {};
    if (days && Number.isFinite(days) && days > 0) {
      where.criadoEm = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }
    if (produto && PRODUTOS.includes(produto)) where.produto = produto;

    const rows = await prisma.venda.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      include: { lead: { select: { nome: true, metadata: true } } },
    });

    // registradoPor é um user id sem relação — resolve os nomes num map
    const userIds = [...new Set(rows.map((v) => v.registradoPor).filter(Boolean))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.nome]));

    const vendas = rows.map(({ lead, ...v }) => {
      const meta = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
      return {
        ...v,
        valor: v.valor != null ? Number(v.valor) : null,
        leadNome: lead?.nome ?? null,
        origem: meta.origem === "ads" ? "ads" : "organico", // origem implícita = organico
        atendenteNome: v.registradoPor ? userMap.get(v.registradoPor) ?? null : null,
      };
    });

    const total = vendas.reduce((s, v) => s + (v.valor || 0), 0);

    // Agregados calculados em JS sobre o resultado (sem query nova).
    const porOrigem = {};    // base pro custo-por-venda de tráfego pago
    const porProduto = {};   // iphone/macbook/... → { count, total }
    const porAtendente = {}; // nome do atendente → { count, total }
    for (const v of vendas) {
      const valor = v.valor || 0;
      const o = (porOrigem[v.origem] ||= { count: 0, total: 0 });
      o.count += 1; o.total += valor;
      const p = (porProduto[v.produto] ||= { count: 0, total: 0 });
      p.count += 1; p.total += valor;
      const nome = v.atendenteNome || "—";
      const a = (porAtendente[nome] ||= { count: 0, total: 0 });
      a.count += 1; a.total += valor;
    }

    return { vendas, summary: { count: vendas.length, total, porOrigem, porProduto, porAtendente } };
  });
}
