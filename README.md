# 🚀 Teknos CRM — Atendimento Omnichannel com IA (Bia)

**Teknos CRM** é uma plataforma robusta de atendimento omnichannel por WhatsApp e redes sociais, integrada com Inteligência Artificial (a **Bia**), desenvolvida para automatizar e otimizar a comunicação da **Teknos Assistência**.

O sistema centraliza conversas do MercadoPhone (WhatsApp) e da Meta (Instagram/Messenger), classifica e responde clientes utilizando a Bia (orquestrada via n8n), faz o *handoff* inteligente para atendentes humanos, além de gerir o funil de vendas, follow-up, pós-venda e rastreamento de origem de leads (incluindo tráfego pago via *Click-to-WhatsApp*).

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
| :--- | :--- |
| **Backend** | Node.js, Fastify, Prisma (PostgreSQL), Redis, Socket.IO, Web Push (VAPID) |
| **Frontend** | Next.js (App Router), Tailwind CSS, PWA |
| **Inteligência Artificial** | n8n (workflows da Bia) — integração bidirecional via Webhooks |
| **Infraestrutura** | Docker Compose, Nginx Reverso local (TLS Self-Signed), Nginx + Certbot em VPS |

---

## 📁 Estrutura do Projeto

<pre><code>teknos-crm/
├── backend/
│   ├── src/
│   │   ├── index.js        # Inicialização do Fastify, Socket.IO e agendador de tarefas
│   │   ├── routes/         # Rotas da API (leads, chats, funil, vendas, webhooks, push)
│   │   ├── core/           # Processamento de mensagens, dispatcher da Bia e canais
│   │   ├── channels/       # Adapters por canal (WhatsApp/MercadoPhone, Meta)
│   │   ├── services/       # Watchdog, handoffWatch, follow-up, pós-venda, sync
│   │   └── lib/            # Instâncias do Prisma, Redis, Push e cache de configurações
│   └── prisma/             # Schemas e migrations da base de dados PostgreSQL
├── frontend/
│   └── src/
│       ├── app/            # Módulos e páginas (chats, funil, vendas, followup, settings)
│       └── components/     # Componentes de UI (layout, chat, notificações)
├── nginx/                  # Configuração do Proxy Reverso local (nginx.conf + certs)
├── docker-compose.yml      # Serviços: Postgres, Redis, Backend, Frontend, WAHA, n8n
├── docker-compose.proxy.yml# Overlay para ambiente local com Proxy Nginx + TLS
├── nginx.conf              # Configuração de referência para o host na VPS
├── deploy-vps.sh           # Script automatizado de deploy em produção
└── .env.deploy.example     # Template das variáveis de ambiente de deploy
</code></pre>

---

## 💻 Execução Local (com Proxy Reverso)

O Nginx (`nginx/nginx.conf`, com certificado TLS self-signed) atua como **ponto único de entrada**: o acesso via `https://mordorlab.internal.lan` redireciona para o frontend e faz o proxy das chamadas `/api/*`, `/socket.io/*` e `/health` para o backend, garantindo funcionamento sob **origem única** sem conflitos de CORS ou cookies.

### 1. Mapeamento no ficheiro Hosts
Adiciona a seguinte entrada ao teu ficheiro de hosts (`C:\Windows\System32\drivers\etc\hosts` no Windows ou `/etc/hosts` no Linux/Mac):

`192.168.5.54 mordorlab.internal.lan`

### 2. Comandos de Inicialização

1. **Gerar o certificado TLS Self-Signed (executar uma única vez):**
docker run --rm -v "$PWD/nginx/certs:/certs" nginx:1.27-alpine sh -c "apk add --no-cache openssl >/dev/null 2>&1; openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 825 -keyout /certs/privkey.pem -out /certs/fullchain.pem -subj '/CN=mordorlab.internal.lan' -addext 'subjectAltName=IP:127.0.0.1,IP:192.168.5.54,DNS:localhost,DNS:mordorlab.internal.lan,DNS:crm.teknosCEL.shop,DNS:n8n.teknosCEL.shop'"


2. **Reconstruir o Frontend (sempre que alterar variáveis de ambiente):**
docker compose build frontend


3. **Subir a stack completa com Proxy Reverso:**
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d


> **Acesso:** Abre no teu navegador `https://mordorlab.internal.lan`. Para evitar avisos de certificado no navegador, importa o ficheiro `nginx/certs/fullchain.pem` como Autoridade de Certificação Raiz Confiável.

---

## 🔀 Rotas Mapeadas no Proxy Local

| Rota (`https://mordorlab.internal.lan`) | Serviço Alvo |
| :--- | :--- |
| `/` | **Frontend** (Next.js - `:3000`) |
| `/api/*` | **Backend** (Fastify - `:3001`), inclui uploads e webhooks |
| `/socket.io/*` | **Backend** — Conexões Socket.IO (WebSockets / Polling) |
| `/health` | **Backend** — Health Check |

> **Painéis Administrativos:** Acessíveis diretamente sem passar pelo proxy:
> - **n8n:** `http://mordorlab.internal.lan:5678`
> - **WAHA:** `http://mordorlab.internal.lan:3002`

---

## ⚙️ Alternativas de Execução Local

### Opção A — Docker Sem Proxy (Acesso por Portas Diretas)

docker compose up --build


### Opção B — Execução Manual (Desenvolvimento Local sem Docker)
*Requer instâncias ativas de PostgreSQL e Redis no sistema.*

**Backend:**
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev


**Frontend:**
cd frontend
npm install
npm run dev


---

## 🌐 Deploy em Produção (VPS)

As configurações de produção e segredos são mantidas fora do controlo de versões no ficheiro `.env.deploy` (ignorado no Git). O script `deploy-vps.sh` carrega estas informações e provisiona o ambiente na VPS.

cp .env.deploy.example .env.deploy
bash deploy-vps.sh


### Ações Executadas pelo Script de Deploy:
1. Sincronização do código fonte com a VPS via `rsync`.
2. Geração automática do ficheiro `.env` no servidor.
3. Inicialização dos containers Docker e aplicação das migrations (`prisma migrate deploy`).
4. Configuração do Nginx no servidor e emissão/renovação de certificados SSL via Certbot.

---

## 🔌 Tabela de Portas

| Serviço | Porta | Descrição |
| :--- | :--- | :--- |
| **Nginx Proxy** | `80` / `443` | Proxy Reverso e terminação SSL/TLS |
| **Frontend** | `3000` | Interface do utilizador |
| **Backend** | `3001` | API REST e WebSockets |
| **n8n** | `5678` | Painel de automação de fluxos com IA |
| **WAHA** | `3002` | API e Dashboard do WhatsApp |
| **PostgreSQL**| `5432` | Base de dados relacional |
| **Redis** | `6379` | Cache de sessão e filas |
