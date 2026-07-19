-- Tarefa 1b: adiciona messenger e tiktok ao enum Channel
-- messenger já pode existir da migration anterior — IF NOT EXISTS protege
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'messenger';
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'tiktok';
