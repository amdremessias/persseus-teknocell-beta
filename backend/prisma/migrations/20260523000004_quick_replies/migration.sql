-- Respostas rapidas com atalho (/atalho) escopo company ou user.

CREATE TABLE IF NOT EXISTS quick_replies (
  id        TEXT PRIMARY KEY,
  atalho    TEXT NOT NULL,
  texto     TEXT NOT NULL,
  escopo    TEXT NOT NULL DEFAULT 'company',
  user_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique por (atalho, user_id) — NULL user_id permite mesma escopo company unica
CREATE UNIQUE INDEX IF NOT EXISTS quickreply_atalho_user_uk ON quick_replies(atalho, COALESCE(user_id, ''));

-- Seed: 4 atalhos padrao no escopo company
INSERT INTO quick_replies (id, atalho, texto, escopo) VALUES
  ('seed_qr_preco_iphone15', 'preco-iphone15', 'Olá! O iPhone 15 está a partir de R$ 5.999 à vista. Posso te ajudar a escolher o modelo ideal?', 'company'),
  ('seed_qr_horario',        'horario',        'Nosso horário de atendimento é de segunda a sábado das 9h às 19h.', 'company'),
  ('seed_qr_garantia',       'garantia',       'Todos os aparelhos novos tem 1 ano de garantia oficial Apple/fabricante. Seminovos tem 90 dias de garantia da loja.', 'company'),
  ('seed_qr_endereco',       'endereco',       'Estamos na Av. Principal, 1234 - Centro. Tem estacionamento na frente da loja!', 'company')
ON CONFLICT DO NOTHING;
