-- Remove duplicatas: para cada (modelo, condicao), mantém apenas o registro
-- com menor id (o mais antigo), apagando todas as cópias posteriores.
DELETE FROM iphone_stock_items
WHERE id NOT IN (
  SELECT MIN(id)
  FROM iphone_stock_items
  GROUP BY modelo, condicao
);

-- Adiciona constraint de unicidade para impedir duplicatas futuras.
ALTER TABLE iphone_stock_items
  ADD CONSTRAINT iphone_stock_modelo_condicao_uk UNIQUE (modelo, condicao);
