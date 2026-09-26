-- Tabela de tickets de atendimento: cada conversa (lead) recebe um número
-- sequencial de protocolo p/ acompanhamento. Um ticket nasce "aberto" no primeiro
-- contato (ou ao reabrir após finalização) e é encerrado quando o atendente
-- finaliza a conversa (arquivado/convertido/perdido).
CREATE TABLE "tickets" (
    "id"            TEXT NOT NULL,
    "numero"        SERIAL NOT NULL,
    "lead_id"       TEXT NOT NULL,
    "canal"         TEXT NOT NULL DEFAULT 'whatsapp',
    "assunto"       TEXT,
    "fila"          TEXT,
    "atendente_id"  TEXT,
    "status"        TEXT NOT NULL DEFAULT 'aberto', -- aberto | finalizado
    "aberto_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tickets_numero_key" ON "tickets"("numero");
CREATE INDEX "tickets_lead_id_status_idx" ON "tickets"("lead_id", "status");
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;