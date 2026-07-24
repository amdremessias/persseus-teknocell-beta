-- Marca quando o pedido de avaliação no Google foi enviado pra essa venda/lead.
-- NULL = ainda não pedido. Preenchido uma única vez (anti-abuso: 1 review/lead).
ALTER TABLE "pos_venda_followup"
    ADD COLUMN IF NOT EXISTS "review_requested_at" TIMESTAMPTZ;
