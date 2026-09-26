-- Tabela crua de follow-up de abandono da BIA (sem model Prisma;
-- acessada via SQL cru em services/followup.js e routes/followups.js).
-- Padrão espelhado por pos_venda_followup. Chave única por número.
CREATE TABLE IF NOT EXISTS "bia_followup" (
    "number"                TEXT NOT NULL,
    "lead_nome"             TEXT,
    "abandono_ts"           TIMESTAMPTZ,
    "last_customer_msg_ts"  TIMESTAMPTZ,
    "fu_stage"              INTEGER NOT NULL DEFAULT 0,
    "next_fu_at"            TIMESTAMPTZ,
    "status"                TEXT NOT NULL DEFAULT 'ativo',
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "bia_followup_pkey" PRIMARY KEY ("number")
);

-- Índice parcial pros disparos pendentes (mesmo padrão do pos_venda_followup).
CREATE INDEX IF NOT EXISTS "idx_bia_followup_due"
    ON "bia_followup" ("next_fu_at") WHERE (status = 'ativo');