-- Admin: grupos, filas de atendimento, canais WhatsApp e permissões de usuários
-- Migration aditiva — não altera tabelas/índices pré-existentes.

-- CreateEnum
CREATE TYPE "QueueProfile" AS ENUM ('atendente', 'supervisor', 'gestor');

-- CreateEnum
CREATE TYPE "QueueAssignmentStrategy" AS ENUM ('round_robin', 'least_busy', 'skill_based', 'manual');

-- CreateEnum
CREATE TYPE "WhatsAppChannelStatus" AS ENUM ('pending', 'connected', 'disconnected', 'banned', 'expired');

-- AlterTable: users (perfis/permissões/reset de senha)
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "last_password_change" TIMESTAMP(3),
ADD COLUMN     "password_reset_expires" TIMESTAMP(3),
ADD COLUMN     "password_reset_token" TEXT,
ADD COLUMN     "permissions" JSONB DEFAULT '[]';

-- CreateTable: times/grupos
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT NOT NULL DEFAULT '#1B5E20',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable: membros de time
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'membro',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: filas de atendimento
CREATE TABLE "attendance_queues" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT NOT NULL DEFAULT '#1B5E20',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "horario_inicio" TEXT,
    "horario_fim" TEXT,
    "diasSemana" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "estrategia_atribuicao" "QueueAssignmentStrategy" NOT NULL DEFAULT 'round_robin',
    "max_leads_por_atendente" INTEGER DEFAULT 20,
    "timeout_segundos" INTEGER NOT NULL DEFAULT 120,
    "team_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable: membros de fila (perfil + prioridade)
CREATE TABLE "queue_members" (
    "id" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile" "QueueProfile" NOT NULL DEFAULT 'atendente',
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: canais WhatsApp
CREATE TABLE "whatsapp_channels" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "phone_number_id" TEXT,
    "waba_id" TEXT,
    "business_account_id" TEXT,
    "access_token" TEXT,
    "status" "WhatsAppChannelStatus" NOT NULL DEFAULT 'pending',
    "qr_code" TEXT,
    "qr_code_expires" TIMESTAMP(3),
    "last_connected" TIMESTAMP(3),
    "webhook_url" TEXT,
    "webhook_verify_token" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "criado_por_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_channels_pkey" PRIMARY KEY ("id")
);

-- AlterTable: fila na atribuição
ALTER TABLE "queue_assignments" ADD COLUMN     "queue_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "teams_nome_key" ON "teams"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_queues_nome_key" ON "attendance_queues"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "queue_members_queue_id_user_id_key" ON "queue_members"("queue_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_channels_phone_number_id_key" ON "whatsapp_channels"("phone_number_id");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_queues" ADD CONSTRAINT "attendance_queues_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_members" ADD CONSTRAINT "queue_members_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "attendance_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_members" ADD CONSTRAINT "queue_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_assignments" ADD CONSTRAINT "queue_assignments_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "attendance_queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;