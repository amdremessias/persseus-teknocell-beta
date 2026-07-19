-- Resumo vivo da conversa, atualizado pela Bia a cada turno (workflow BIA_CRM_FULL_memoria)

ALTER TABLE leads ADD COLUMN IF NOT EXISTS resumo TEXT;
