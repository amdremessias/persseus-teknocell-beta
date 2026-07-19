-- Tabela de estoque/catálogo de iPhones usada pelo site iphone.teknoscel.shop

CREATE TABLE iphone_stock_items (
  id         SERIAL PRIMARY KEY,
  modelo     TEXT NOT NULL,
  condicao   TEXT NOT NULL,
  preco_pix  INTEGER NOT NULL,
  observacao TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
