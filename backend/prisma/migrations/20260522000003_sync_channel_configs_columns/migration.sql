-- Diagnóstico: channel_configs já tem as colunas corretas (config, criado_em, atualizado_em).
-- O bug "column token does not exist" era Prisma Client desatualizado no container (gerado
-- antes da migration 000001 que removeu token/webhook_url).
-- Fix real: npx prisma generate dentro do container (sem ALTER TABLE necessário).
--
-- Este arquivo é no-op de documentação. Registra o estado esperado para referência.

-- Verifica que colunas corretas existem (seguro rodar múltiplas vezes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='channel_configs' AND column_name='config') THEN
    ALTER TABLE "channel_configs" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='channel_configs' AND column_name='criado_em') THEN
    ALTER TABLE "channel_configs" ADD COLUMN "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='channel_configs' AND column_name='atualizado_em') THEN
    ALTER TABLE "channel_configs" ADD COLUMN "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;
