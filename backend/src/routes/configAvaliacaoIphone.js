import { z } from 'zod';
import prisma from '../lib/prisma.js';

const CONFIG_ID = 'default';

const TABELA_PADRAO = {
  "iPhone 11": { "64GB": ["550", "700"], "128GB": ["700", "900"], "256GB": ["650", "850"] },
  "iPhone 11 Pro": { "64GB": ["700", "900"], "128GB": ["550", "700"], "256GB": ["700", "950"], "512GB": ["700", "900"] },
  "iPhone 11 Pro Max": { "64GB": ["800", "1000"], "128GB": ["850", "1100"], "256GB": ["800", "1050"], "512GB": ["750", "1000"] },
  "iPhone 12": { "64GB": ["750", "950"], "128GB": ["950", "1250"], "256GB": ["1000", "1250"] },
  "iPhone 12 Mini": { "64GB": ["450", "600"] },
  "iPhone 12 Pro": { "128GB": ["1050", "1350"], "256GB": ["1200", "1550"], "512GB": ["1350", "1750"] },
  "iPhone 12 Pro Max": { "128GB": ["1300", "1700"], "256GB": ["1550", "2000"], "512GB": ["1900", "2450"] },
  "iPhone 13": { "128GB": ["1200", "1550"], "256GB": ["1300", "1700"], "512GB": ["1400", "1800"] },
  "iPhone 13 Mini": { "128GB": ["700", "900"], "256GB": ["700", "900"] },
  "iPhone 13 Pro": { "128GB": ["1500", "1950"], "256GB": ["1650", "2150"], "512GB": ["1850", "2350"] },
  "iPhone 13 Pro Max": { "128GB": ["1750", "2300"], "256GB": ["1850", "2400"], "512GB": ["1950", "2500"] },
  "iPhone 14": { "128GB": ["1400", "1800"], "256GB": ["1550", "2000"], "512GB": ["1450", "1900"] },
  "iPhone 14 Plus": { "128GB": ["1500", "1900"], "256GB": ["1400", "1800"] },
  "iPhone 14 Pro": { "128GB": ["1900", "2450"], "256GB": ["1950", "2500"], "512GB": ["2350", "3000"], "1TB": ["2550", "3250"] },
  "iPhone 14 Pro Max": { "128GB": ["2100", "2700"], "256GB": ["2200", "2800"], "512GB": ["2300", "2950"] },
  "iPhone 15": { "128GB": ["1850", "2350"], "256GB": ["1950", "2500"] },
  "iPhone 15 Plus": { "128GB": ["1950", "2500"], "256GB": ["2000", "2600"] },
  "iPhone 15 Pro": { "128GB": ["2250", "2900"], "256GB": ["2350", "3050"], "512GB": ["2550", "3300"] },
  "iPhone 15 Pro Max": { "256GB": ["2750", "3550"], "512GB": ["2950", "3750"], "1TB": ["2050", "2600"] },
  "iPhone 16": { "128GB": ["2250", "2900"], "256GB": ["2350", "3050"] },
  "iPhone 16 Plus": { "128GB": ["2500", "3200"], "256GB": ["2050", "2600"] },
  "iPhone 16 Pro": { "128GB": ["3050", "3900"], "256GB": ["3250", "4150"], "512GB": ["3450", "4450"] },
  "iPhone 16 Pro Max": { "256GB": ["3600", "4600"], "512GB": ["3850", "5000"], "1TB": ["4100", "5300"] },
  "iPhone 17": { "256GB": ["2900", "3700"] },
  "iPhone 17 Pro": { "256GB": ["4450", "5700"] },
  "iPhone 17 Pro Max": { "256GB": ["5150", "6600"], "512GB": ["5450", "7000"], "1TB": ["6650", "8550"] },
};

const tabelaSchema = z.object({
  tabela: z.record(z.string(), z.record(z.string(), z.tuple([z.string(), z.string()]))),
});

export default async function configAvaliacaoIphoneRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/api/config/avaliacao-iphone', auth, async () => {
    let config = await prisma.configAvaliacaoIphone.findUnique({ where: { id: CONFIG_ID } });
    if (!config) {
      config = await prisma.configAvaliacaoIphone.create({
        data: { id: CONFIG_ID, tabela: TABELA_PADRAO },
      });
    }
    return { tabela: config.tabela };
  });

  fastify.patch('/api/config/avaliacao-iphone', auth, async (req, reply) => {
    if (req.user.nivel !== 'admin') return reply.code(403).send({ error: 'Acesso negado' });

    const parsed = tabelaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'campos_invalidos', campos: parsed.error.issues.map((i) => i.path.join('.')) });
    }

    const config = await prisma.configAvaliacaoIphone.upsert({
      where: { id: CONFIG_ID },
      update: { tabela: parsed.data.tabela, updatedBy: req.user.id },
      create: { id: CONFIG_ID, tabela: parsed.data.tabela, updatedBy: req.user.id },
    });
    return { tabela: config.tabela };
  });
}
