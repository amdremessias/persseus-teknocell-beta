-- Sistema de tags coloridas: tags globais + relacao N:N com leads.

CREATE TABLE IF NOT EXISTS tags (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE,
  cor       TEXT NOT NULL DEFAULT '#1B5E20',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag  ON lead_tags(tag_id);

-- Seed de 6 tags padrao (id usa formato cuid-curto pra evitar colisao).
INSERT INTO tags (id, nome, cor) VALUES
  ('seed_tag_iphone',   'iPhone',     '#0D47A1'),
  ('seed_tag_xiaomi',   'Xiaomi',     '#FF6B00'),
  ('seed_tag_concerto', 'Concerto',   '#4A148C'),
  ('seed_tag_capa',     'Capa',       '#1B5E20'),
  ('seed_tag_vip',      'VIP',        '#B71C1C'),
  ('seed_tag_friolead', 'Lead frio',  '#757575')
ON CONFLICT (nome) DO NOTHING;
