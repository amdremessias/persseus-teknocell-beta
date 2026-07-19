#!/usr/bin/env node
// Baixa mídias externas do eveo.com.br e atualiza media_url para caminho local.
// Uso: node --env-file=.env scripts/backfill-media.js

import prisma from '../src/lib/prisma.js';
import { downloadMedia } from '../src/lib/media-downloader.js';

const TARGET_DOMAIN = 'eveo.com.br';

async function main() {
  const messages = await prisma.message.findMany({
    where: {
      mediaUrl: { startsWith: 'http' },
    },
    select: { id: true, mediaUrl: true },
  });

  const targets = messages.filter(m => m.mediaUrl.includes(TARGET_DOMAIN));
  console.log(`[media-download] backfill: ${targets.length} mensagens com mídia ${TARGET_DOMAIN}`);

  let ok = 0;
  let failed = 0;

  for (const msg of targets) {
    const local = await downloadMedia(msg.mediaUrl);
    if (local) {
      await prisma.message.update({
        where: { id: msg.id },
        data: { mediaUrl: local },
      });
      ok++;
    } else {
      console.warn(`[media-download] falhou id=${msg.id} url=${msg.mediaUrl}`);
      failed++;
    }
  }

  console.log(`[media-download] backfill concluído — ok=${ok} falhou=${failed}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[media-download] erro fatal:', err.message);
  process.exit(1);
});
