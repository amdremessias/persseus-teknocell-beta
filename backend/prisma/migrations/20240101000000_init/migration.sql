-- CreateEnum
CREATE TYPE "UserNivel" AS ENUM ('admin', 'supervisor', 'atendente');

-- CreateEnum
CREATE TYPE "MessageTipo" AS ENUM ('cliente', 'bia', 'atendente', 'interno');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "nivel" "UserNivel" NOT NULL DEFAULT 'atendente',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "external_id" TEXT,
    "nome" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "canal_origem" TEXT,
    "canal_mensagem" TEXT,
    "fonte_campanha" TEXT,
    "interesse" TEXT,
    "modelo_desejado" TEXT,
    "estado_preferido" TEXT,
    "faixa_investimento" TEXT,
    "vai_trocar" BOOLEAN,
    "modelo_troca" TEXT,
    "status_pipeline" TEXT NOT NULL DEFAULT 'novo',
    "bia_ativa" BOOLEAN NOT NULL DEFAULT true,
    "score" INTEGER NOT NULL DEFAULT 0,
    "atendente_id" TEXT,
    "followup_stage" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacoes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "tipo" "MessageTipo" NOT NULL,
    "texto" TEXT NOT NULL,
    "canal" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "canal" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_assignments" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "atendente_id" TEXT NOT NULL,
    "atribuido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assumido_em" TIMESTAMP(3),
    "timeout_em" TIMESTAMP(3),
    CONSTRAINT "queue_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_configs" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_configs" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "token" TEXT,
    "webhook_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "channel_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "variaveis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "canal" TEXT NOT NULL,
    "aprovado_meta" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("chave")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "leads_external_id_key" ON "leads"("external_id");
CREATE UNIQUE INDEX "channel_configs_canal_key" ON "channel_configs"("canal");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_atendente_id_fkey"
    FOREIGN KEY ("atendente_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "queue_assignments" ADD CONSTRAINT "queue_assignments_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "queue_assignments" ADD CONSTRAINT "queue_assignments_atendente_id_fkey"
    FOREIGN KEY ("atendente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
