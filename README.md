# Teknos CRM

CRM omnichannel de atendimento por WhatsApp com IA (a **Bia**), para a Teknos
Assistência. Recebe conversas via MercadoPhone (WhatsApp) e Meta
(Instagram/Messenger), classifica e responde com a Bia (orquestrada no n8n),
faz handoff para atendentes, follow-up e pós-venda, e registra vendas e origem
de lead (inclusive tráfego pago via Click-to-WhatsApp).

## Stack

- **Backend:** Node.js + Fastify, Prisma (PostgreSQL), Redis, Socket.IO, Web Push (VAPID)
- **Frontend:** Next.js (App Router) + Tailwind, PWA
- **IA:** n8n (workflows da Bia) — o CRM conversa com o n8n via webhooks
- **Infra:** Docker Compose; deploy num VPS atrás de Nginx + Certbot

## Estrutura

```
backend/
  src/
    index.js        # bootstrap Fastify + Socket.IO + jobs agendados
    routes/         # rotas HTTP (leads, chats, funil, vendas, webhooks, push, ...)
    core/           # ingestão de mensagens, dispatcher da Bia, outbound
    channels/       # adapters por canal (whatsapp/MercadoPhone, meta)
    services/       # watchdog, handoffWatch, follow-up, pós-venda, messageSync
    lib/            # prisma, redis, push, settings-cache, ...
  prisma/           # schema + migrations
frontend/
  src/app/          # páginas (chats, funil, vendas, followup, settings, ...)
  src/components/    # UI (layout, chat, notificações)
n8n-workflows/live/ # export read-only dos workflows ativos da Bia
docker-compose.yml  # postgres + redis + backend + frontend
deploy-vps.sh       # deploy completo no VPS
.env.deploy.example # template dos segredos do deploy (copie p/ .env.deploy)
```

## Rodar local

### Opção A — Docker (recomendado)

Sobe Postgres, Redis, backend (`:3001`) e frontend (`:3000`) de uma vez. O
compose já tem defaults, então roda sem `.env` para um ambiente de teste:

```bash
docker compose up --build
# frontend: http://localhost:3000   ·   backend: http://localhost:3001
```

Para customizar segredos/portas, crie um `.env` na raiz (as variáveis são as
mesmas usadas pelo compose: `POSTGRES_*`, `REDIS_PASSWORD`, `JWT_SECRET`, etc.).

### Opção B — Manual (sem Docker)

Requer Postgres e Redis rodando localmente.

```bash
# Backend
cd backend
cp .env.example .env        # preencha DATABASE_URL, REDIS_URL, JWT_SECRET, ...
npm install
npm run db:migrate          # aplica as migrations
npm run db:seed             # cria admin padrão + settings
npm run dev                 # http://localhost:3001

# Frontend (outro terminal)
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

## Deploy (VPS)

Os segredos ficam **fora do git** em `.env.deploy` (gitignored). O
`deploy-vps.sh` carrega esse arquivo e gera o `.env` no servidor.

```bash
cp .env.deploy.example .env.deploy   # preencha os segredos reais
bash deploy-vps.sh
```

O script: envia o código (rsync), gera o `.env` no VPS, sobe o Docker Compose,
aplica as migrations (`prisma migrate deploy` roda no start do container),
configura Nginx e emite/renova o SSL via Certbot.

## Portas

| Serviço | Porta |
|---|---|
| Frontend | 3000 |
| Backend | 3001 |
| PostgreSQL | 5432 |
| Redis | 6379 |
