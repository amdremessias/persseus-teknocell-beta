-- Tabelas auxiliares para estado da inbox (pin de conversa + last_read p/ unreadCount).
-- Schema isolado: não altera tabela leads/messages.

CREATE TABLE IF NOT EXISTS lead_pins (
  lead_id   TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_read_state (
  lead_id      TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_pins_pinned_at ON lead_pins(pinned_at DESC);
