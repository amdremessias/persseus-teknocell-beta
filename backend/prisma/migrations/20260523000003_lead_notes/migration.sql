-- Notas internas por lead (privadas, jamais enviadas pro cliente).

CREATE TABLE IF NOT EXISTS lead_notes (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id),
  conteudo      TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_criado ON lead_notes(lead_id, criado_em DESC);
