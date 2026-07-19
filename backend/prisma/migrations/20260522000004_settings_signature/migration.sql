-- Insere configurações padrão de assinatura do atendente.
-- ON CONFLICT DO NOTHING preserva valores customizados já existentes.

INSERT INTO settings (chave, valor) VALUES
  ('atendente_signature_enabled', 'true'),
  ('atendente_signature_template', '*{nome}*' || E'\n\n' || '{mensagem}')
ON CONFLICT (chave) DO NOTHING;
