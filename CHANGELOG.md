# Changelog — Refactor Omnichannel Teknos CRM

> Sessão única: **2026-05-22** (00:47 → 08:19 -03:00)

---

## [Snapshot] `dce1cfe9` — Pré-refactor

Estado inicial antes de qualquer alteração. Backend single-channel, entrada via `/api/public/leads/incoming` alimentada pelo n8n. Schema sem `WebhookEvent`, sem `canal` enum, sem adapter pattern.

---

## Tarefa 1 — Schema omnichannel foundation

**Commit:** `e038120a` — *2026-05-22*

- `prisma/schema.prisma`: enum `Channel {whatsapp, instagram, telegram}`, `Lead.canal`, `Lead.identifierCanal`, `Message.externalMessageId`, `Message.canal`, `WebhookEvent`, `ChannelConfig` refatorado
- Migration `20260522000001_omnichannel_foundation` criada e aplicada na VPS
- **Bug corrigido** `90dcd4d8`: migration tentava `UPDATE SET canal = NULL` em coluna NOT NULL — substituído por `DELETE` das linhas inválidas

---

## Tarefa 1b — Adiciona Messenger e TikTok ao enum

**Commit:** `16d711b3` — *2026-05-22*

- Migration `20260522000002_add_messenger_tiktok_channels`: `ALTER TYPE "Channel" ADD VALUE`
- `Channel` enum final: `whatsapp, instagram, messenger, telegram, tiktok`
- Aplicado na VPS via `docker cp` + `migrate deploy`

---

## Tarefa 2 — Adapter pattern omnichannel + core de ingestion

**Commit:** `9e1d5b9d` — *2026-05-22*

Arquivos criados:
- `backend/src/channels/base.js` — `ChannelAdapter` base class
- `backend/src/channels/index.js` — registry `getAdapter(canal)`
- `backend/src/channels/whatsapp/{adapter,parser,sender}.js`
- `backend/src/channels/instagram/{adapter,parser,sender}.js` — stub
- `backend/src/channels/messenger/{adapter,parser,sender}.js` — stub
- `backend/src/channels/tiktok/{adapter,parser,sender}.js` — stub
- `backend/src/core/ingestion.js` — WebhookEvent dedup + lead upsert + message create + socket emit
- `backend/src/core/outbound.js` — `sendToCustomer` via adapter
- `backend/src/routes/public.js` — `/api/public/leads/incoming` retorna **410 Gone**

---

## Tarefa 3 — Endpoints de webhook omnichannel

**Commit:** `20084e35` — *2026-05-22*

- `backend/src/routes/webhooks.js`: 5 rotas (`/whatsapp`, `/instagram`, `/messenger`, `/tiktok`, `/bia-response`)
- Todas respondem **200 imediatamente** (fire-and-forget)
- `backend/src/index.js` atualizado: `setupIngestion(io)`, `setupOutbound(io)`, registra `webhookRoutes`
- `backend/.env.example` com vars iniciais

---

## Tarefa 4 — Frontend: badges + filtro por canal + notificações

**Commit:** `9e9b8aea` — *2026-05-22*

- `frontend/src/lib/utils.ts`: `CHANNEL_META`, `formatPhone`, `formatIdentifier`
- `frontend/src/components/common/ChannelBadge.tsx`: badge colorido por canal
- `frontend/src/components/leads/LeadCard.tsx`: exibe canal + identifier formatado
- `frontend/src/app/leads/page.tsx`: filtro por canal no header
- `frontend/src/hooks/useNotifications.ts`: toast + Web Audio beep + badge no `document.title` + localStorage sound toggle
- `frontend/src/components/notifications/ToastContainer.tsx`: toast slide-in, click navega para lead
- `frontend/src/components/layout/AppShell.tsx`: listeners `message:incoming` + `lead:new`
- `frontend/src/components/layout/Sidebar.tsx`: botão som ligado/silenciado

---

## Fix — Prisma Client desatualizado no container

**Commit:** `50013caa` — *2026-05-22*

**Root cause:** `docker cp` nunca tinha copiado `prisma/schema.prisma` para dentro do container. `npx prisma generate` usava schema antigo (com `token`/`webhook_url`, sem `WebhookEvent`). Coluna `token` foi removida na migration 000001 mas o client ainda tentava acessá-la.

**Fix:**
```bash
docker cp .../schema.prisma teknos_backend:/app/prisma/schema.prisma
docker exec teknos_backend npx prisma generate
docker compose restart backend
```

`RELATORIO-FIX-CHANNEL-CONFIGS.md` gerado na raiz documentando diagnóstico completo.

---

## Tarefa 5.1 — Parser MercadoPhone reescrito

**Commit:** `3d879a94` — *2026-05-22*

- `backend/src/channels/whatsapp/parser.js`: parser antigo usava `response.wid` (formato antigo). Reescrito para discriminar por `acao + fromMe + userId`:
  - `acao=start` → `kind: lifecycle`
  - `acao=from_internal, fromMe=false` → `kind: incoming`
  - `acao=from_internal, fromMe=true, userId=null` → `kind: echo` (bia_echo)
  - `acao=from_internal, fromMe=true, userId≠null` → `kind: echo` (atendente humano)
  - qualquer outro → `kind: unknown`
- `backend/tests/fixtures/mercadophone/01-start.json`
- `backend/tests/fixtures/mercadophone/02-cliente-msg.json`
- `backend/tests/fixtures/mercadophone/03-bia-echo.json`

---

## Tarefa 5.2 — Ingestion refatorado por kind

**Commit:** `2dd7c59f` — *2026-05-22*

- `backend/src/core/ingestion.js`: `switch(parsed.kind)` com handlers separados
- `handleLifecycle`: upsert lead, sem message
- `handleIncoming`: fluxo completo + socket `message:incoming` global
- `handleEcho`: persiste sem criar lead + sem toast global
- Guard `BIA_MODE=observer`: não dispara BIA por padrão

---

## Tarefa 5.3 — BIA Dispatcher (delay grouper)

**Commit:** `6d8c30b7` — *2026-05-22*

- `backend/src/core/bia-dispatcher.js` criado
- `Map<leadId, {timer, scheduledAt}>` + `setTimeout` de 8s
- Reagenda timer se chegam mensagens consecutivas antes de disparar
- `callBiaWebhook` com header `X-Bia-Secret`

---

## Tarefa 5.4 — Endpoint bia-response novo payload

**Commit:** `314eb3d0` — *2026-05-22*

- `/api/webhooks/bia-response` aceita `{lead_id, respostas:[{texto}], metadata}`
- Delay `BIA_INTER_MESSAGE_DELAY_MS` (2s) entre mensagens
- Retorna `{ok: true, queued: N}` imediatamente

---

## Tarefa 5.5 — Sender: numero → number

**Commit:** `1d4c80f0` — *2026-05-22*

- `backend/src/channels/whatsapp/sender.js`: campo `numero` → `number` no payload da API MercadoPhone

---

## Tarefa 5.6 — .env.example documentado

**Commit:** `0c0c3272` — *2026-05-22*

- `backend/.env.example` criado com todas as vars: `BIA_MODE`, `BIA_WEBHOOK_URL`, `BIA_SECRET`, `BIA_GROUPING_DELAY_MS`, `BIA_INTER_MESSAGE_DELAY_MS`, `MERCADOPHONE_TOKEN`

---

## Tarefa 5.7 — Testes de ingestion

**Commit:** `b8a20354` — *2026-05-22*

- `backend/tests/ingestion.test.js`: 5 testes com `node:test` (built-in, zero deps extras)
  - `start → kind=lifecycle`
  - `from_internal fromMe=false → kind=incoming`
  - `from_internal fromMe=true userId=null → kind=echo bia_echo`
  - `from_internal fromMe=true userId≠null → kind=echo atendente`
  - `acao desconhecida → kind=unknown`
- Todos passando: `pass 5, fail 0`
- `package.json`: script `"test": "node --test tests/**/*.test.js"`

---

## Tarefa 6 — Env vars na VPS + fix recorrente

**Commit:** `4cc92b2f` — *2026-05-22*

- `docker-compose.yml`: `BIA_MODE`, `BIA_WEBHOOK_URL`, `BIA_SECRET`, `BIA_GROUPING_DELAY_MS`, `BIA_INTER_MESSAGE_DELAY_MS` adicionados ao `environment` do service `backend`
- `/opt/teknos-crm/.env` na VPS: vars BIA adicionadas, `BIA_SECRET` gerado com `openssl rand -hex 32`
- `ingestion.js`: `tipo: bia_echo → bia` no `handleEcho` (enum `MessageTipo` não tinha `bia_echo`)
- Descoberta: `docker compose up` **recria** o container (perde `prisma generate`); `docker restart` apenas reinicia (preserva filesystem). Procedimento de deploy ajustado.

---

## Tarefa 8 — Fix definitivo Dockerfile + endpoints page

**Commit:** `51e18fb8` — *2026-05-22*

- `backend/package-lock.json`: regenerado (`npm install --package-lock-only`) — faltavam `@fastify/multipart` e `@fastify/static`
- Rebuild da imagem backend na VPS: `prisma generate` agora baked na imagem (não precisa mais de `docker cp schema + generate` manual após deploys)
- `frontend/src/app/settings/endpoints/page.tsx`: reescrita com 4 endpoints reais (MercadoPhone, BIA, Instagram, Messenger) + warning no card principal + payloads + auth
- `RELATORIO-FINAL-REFACTOR.md` e `CHANGELOG.md` criados

---

*Gerado em 2026-05-22 por Claude Sonnet 4.6*
