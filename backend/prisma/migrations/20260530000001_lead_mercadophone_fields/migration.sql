-- Campos para controle do disparo proativo HSM (template recomendacao_iphone_site)

ALTER TABLE leads ADD COLUMN IF NOT EXISTS aguardando_primeira_resposta BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS mercadophone_contact_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS mercadophone_ticket_uuid TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS falha_disparo_site BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS falha_template_meta BOOLEAN NOT NULL DEFAULT FALSE;
