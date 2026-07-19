-- Adiciona campo metadata (JSONB) ao Lead para armazenar dados estruturados arbitrários
-- Utilizado pelo endpoint /api/leads/from-site-quiz (chave "quizData")

ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB;
