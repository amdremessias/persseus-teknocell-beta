CREATE TABLE "scheduled_messages" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT,
    "template_nome" TEXT,
    "template_variaveis" JSONB,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erro" TEXT,
    "criado_por_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_em" TIMESTAMP(3),

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_messages_status_scheduled_at_idx" ON "scheduled_messages"("status", "scheduled_at");

CREATE INDEX "scheduled_messages_lead_id_idx" ON "scheduled_messages"("lead_id");

ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
