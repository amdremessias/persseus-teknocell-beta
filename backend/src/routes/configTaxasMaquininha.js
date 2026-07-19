import { z } from 'zod';
import prisma from '../lib/prisma.js';

const CONFIG_ID = 'default';

const TAXAS_PADRAO = {
  1: '1.62',
  2: '2.25',
  3: '2.25',
  4: '2.25',
  5: '2.25',
  6: '2.25',
  7: '2.25',
  8: '2.25',
  9: '2.25',
  10: '2.25',
  11: '2.25',
  12: '2.25',
  13: '11.99',
  14: '12.58',
  15: '13.16',
  16: '13.75',
  17: '14.34',
  18: '14.92',
};

const taxasSchema = z.object({
  taxas: z.record(z.string(), z.string()),
});

export default async function configTaxasMaquininhaRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/api/config/taxas-maquininha', auth, async () => {
    let config = await prisma.configTaxasMaquininha.findUnique({ where: { id: CONFIG_ID } });
    if (!config) {
      config = await prisma.configTaxasMaquininha.create({
        data: { id: CONFIG_ID, taxas: TAXAS_PADRAO },
      });
    }
    return { taxas: config.taxas };
  });

  fastify.patch('/api/config/taxas-maquininha', auth, async (req, reply) => {
    if (req.user.nivel !== 'admin') return reply.code(403).send({ error: 'Acesso negado' });

    const parsed = taxasSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'campos_invalidos', campos: parsed.error.issues.map((i) => i.path.join('.')) });
    }

    const config = await prisma.configTaxasMaquininha.upsert({
      where: { id: CONFIG_ID },
      update: { taxas: parsed.data.taxas, updatedBy: req.user.id },
      create: { id: CONFIG_ID, taxas: parsed.data.taxas, updatedBy: req.user.id },
    });
    return { taxas: config.taxas };
  });
}
