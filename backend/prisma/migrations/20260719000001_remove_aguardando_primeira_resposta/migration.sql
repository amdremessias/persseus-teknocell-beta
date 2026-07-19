-- Remove o campo aguardando_primeira_resposta (fluxo do quiz do site, desativado).
-- O quiz (POST /api/leads/from-site-quiz) foi removido; a isca atual
-- (iphone.teknoscel.shop) usa Click-to-WhatsApp direto, sem passar por este campo.
ALTER TABLE "leads" DROP COLUMN IF EXISTS "aguardando_primeira_resposta";
