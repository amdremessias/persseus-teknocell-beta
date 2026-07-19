-- Adiciona campo tags (TEXT[]) à tabela contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
