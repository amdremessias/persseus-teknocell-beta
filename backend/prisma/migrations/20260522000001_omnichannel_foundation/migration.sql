-- Tarefa 1: Omnichannel Foundation
-- CreateEnum: Channel
CREATE TYPE "Channel" AS ENUM ('whatsapp', 'instagram', 'telegram', 'messenger');

-- AlterTable leads: add canal + identifier_canal
ALTER TABLE "leads" ADD COLUMN "canal" "Channel" NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "leads" ADD COLUMN "identifier_canal" TEXT;

-- Data migration: preenche identifier_canal dos leads WhatsApp a partir do telefone
UPDATE "leads" SET "identifier_canal" = "telefone" WHERE "identifier_canal" IS NULL AND "telefone" IS NOT NULL;

-- CreateIndex: unique (canal, identifier_canal) — exclui NULLs automaticamente no Postgres
CREATE UNIQUE INDEX "lead_canal_identifier_uk" ON "leads"("canal", "identifier_canal");

-- AlterTable messages: canal String? → Channel?, adiciona UNIQUE em external_message_id
-- Garante que valores existentes incompatíveis virem NULL antes do cast
UPDATE "messages" SET "canal" = NULL WHERE "canal" IS NOT NULL AND "canal" NOT IN ('whatsapp', 'instagram', 'telegram', 'messenger');
ALTER TABLE "messages" ALTER COLUMN "canal" TYPE "Channel" USING "canal"::"Channel";
ALTER TABLE "messages" ALTER COLUMN "canal" SET DEFAULT 'whatsapp';
CREATE UNIQUE INDEX "messages_external_message_id_key" ON "messages"("external_message_id");

-- AlterTable channel_configs: canal String → Channel, reestrutura config como Json
-- Salva token antigo no config antes de dropar a coluna
ALTER TABLE "channel_configs" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';
UPDATE "channel_configs" SET "config" = json_build_object('token', "token", 'webhook_url', "webhook_url") WHERE "token" IS NOT NULL OR "webhook_url" IS NOT NULL;
ALTER TABLE "channel_configs" DROP COLUMN IF EXISTS "token";
ALTER TABLE "channel_configs" DROP COLUMN IF EXISTS "webhook_url";
ALTER TABLE "channel_configs" ADD COLUMN "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "channel_configs" ADD COLUMN "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Deleta rows com canal fora do enum (ex: 'facebook', 'tiktok') — canal é NOT NULL, não pode setar NULL
DELETE FROM "channel_configs" WHERE "canal" NOT IN ('whatsapp', 'instagram', 'telegram', 'messenger');
-- Cast canal TEXT → Channel enum
ALTER TABLE "channel_configs" ALTER COLUMN "canal" TYPE "Channel" USING "canal"::"Channel";

-- CreateTable webhook_events
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "canal" "Channel" NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "erro_msg" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");
