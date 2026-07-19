-- Tabela crua de pós-venda (espelha o padrão de bia_followup, sem model Prisma;
-- acessada via SQL cru em services/posvenda.js). Chave única por venda.
CREATE TABLE IF NOT EXISTS "pos_venda_followup" (
    "venda_id"       TEXT NOT NULL,
    "number"         TEXT NOT NULL,
    "lead_id"        TEXT,
    "produto"        TEXT NOT NULL,
    "lead_nome"      TEXT,
    "venda_ts"       TIMESTAMPTZ NOT NULL,
    "pv_stage"       INTEGER NOT NULL DEFAULT 0,
    "next_pv_at"     TIMESTAMPTZ,
    "status"         TEXT NOT NULL DEFAULT 'ativo',
    "postpone_count" INTEGER NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "pos_venda_followup_pkey" PRIMARY KEY ("venda_id")
);

-- Índice parcial pros disparos pendentes (igual idx_bia_followup_due).
CREATE INDEX IF NOT EXISTS "idx_pos_venda_followup_due"
    ON "pos_venda_followup" ("next_pv_at") WHERE (status = 'ativo');

-- Índice por number (cancelar sequências antigas do mesmo cliente).
CREATE INDEX IF NOT EXISTS "idx_pos_venda_followup_number"
    ON "pos_venda_followup" ("number");
