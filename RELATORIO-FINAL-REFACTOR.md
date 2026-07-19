# Relatório Final — Refactor Omnichannel Teknos CRM

**Data:** 2026-05-22  
**Duração:** ~7,5 horas (00:47 → 08:19 -03:00)  
**Commits de código:** 16 | **Arquivos alterados:** 38 | **Linhas:** +1306 / -112

---

## Resumo Executivo

O CRM foi migrado de uma arquitetura **n8n-first** (n8n recebia mensagens e empurrava leads via API REST) para uma arquitetura **CRM-first omnichannel** (CRM recebe webhooks diretamente de cada canal, persiste com dedup dupla, e *opcionalmente* aciona a BIA).

O refactor estabelece a base para suportar WhatsApp, Instagram, Messenger, Telegram e TikTok com o mesmo pipeline, sem duplicar lógica por canal.

---

## Antes × Depois

### Arquitetura

| Aspecto | Antes | Depois |
|---|---|---|
| Entrada de mensagens | n8n recebia → POST `/api/public/leads/incoming` | MercadoPhone POST → `/api/webhooks/whatsapp` |
| Deduplicação | Nenhuma | Dupla: `WebhookEvent.eventId` + `Message.externalMessageId` |
| Discriminação de webhook | Não existia | `kind: lifecycle \| incoming \| echo \| unknown` |
| Echo da BIA | Criava mensagem tipo `atendente` | Detectado, `tipo=bia` + `delivery_status=received_echo` |
| Atendente humano no MercadoPhone | Não detectado | `isHumanAttendantOnMercadoPhone = userId !== null` |
| Canais suportados | Só WhatsApp (via n8n) | WhatsApp ativo; Instagram/Messenger/TikTok stub prontos |
| BIA dispatch | n8n chamava CRM, CRM chamava n8n de volta | CRM controla dispatch; `BIA_MODE=observer` bloqueia |
| Prisma Client no container | Gerado do schema antigo (bug recorrente) | Baked na imagem via `RUN npx prisma generate` |

### Schema do banco

| Tabela/Enum | Antes | Depois |
|---|---|---|
| `Channel` enum | `whatsapp, instagram, telegram` | `+ messenger, tiktok` |
| `Lead.canal` | `String` | `Channel` enum |
| `Lead.identifier_canal` | Não existia | Adicionado; índice único `(canal, identifier_canal)` |
| `Message.external_message_id` | Não existia | Adicionado; `UNIQUE` |
| `Message.canal` | Não existia | Adicionado |
| `ChannelConfig` | `token, webhook_url` (campos obsoletos) | `config JSONB, criado_em, atualizado_em` |
| `WebhookEvent` | Não existia | Novo modelo — anchor de idempotência |

### Fluxo de mensagem recebida (WhatsApp)

**Antes:**
```
Cliente → MercadoPhone → n8n workflow → POST /api/public/leads/incoming → Lead criado
```

**Depois:**
```
Cliente → MercadoPhone → POST /api/webhooks/whatsapp
  → parseWhatsAppWebhook(body) → kind=incoming
  → dedup WebhookEvent (eventId=wid)
  → upsert Lead por (canal, identifier_canal)
  → create Message (tipo=cliente, external_message_id=wid)
  → socket.io: message:incoming + lead:updated
  → BIA_MODE=observer → NÃO dispara (safe default)
```

---

## Estado Final da Produção

### URLs ativas

| Endpoint | Método | Uso |
|---|---|---|
| `https://crm.teknoscel.shop/api/webhooks/whatsapp` | POST | MercadoPhone → CRM (configurar no painel MP) |
| `https://crm.teknoscel.shop/api/webhooks/bia-response` | POST | n8n BIA v3 → CRM (futuro) |
| `https://crm.teknoscel.shop/api/webhooks/instagram` | GET/POST | Meta webhook Instagram (stub) |
| `https://crm.teknoscel.shop/api/webhooks/messenger` | GET/POST | Meta webhook Messenger (stub) |
| `https://crm.teknoscel.shop/api/public/leads/incoming` | POST | **DEPRECATED** — retorna 410 Gone |

### Env vars configuradas na VPS (`/opt/teknos-crm/.env`)

| Var | Valor | Observação |
|---|---|---|
| `BIA_MODE` | `observer` | **NÃO alterar** até BIA v3 validada |
| `BIA_WEBHOOK_URL` | *(vazio)* | Preencher quando n8n v3 estiver ativo |
| `BIA_SECRET` | `2c64f636...` | **Guardado pelo usuário** — não está aqui |
| `BIA_GROUPING_DELAY_MS` | `8000` | 8s de espera entre mensagens antes de acionar BIA |
| `BIA_INTER_MESSAGE_DELAY_MS` | `2000` | 2s entre cada mensagem de resposta |
| `MERCADOPHONE_TOKEN` | `5514996061006` | Número da conta oficial MP |
| `MERCADOPHONE_URL` | URL da API MP | Já configurado |

### Modo de operação atual

```
BIA_MODE = observer
→ CRM recebe e persiste mensagens corretamente
→ CRM NÃO responde automaticamente
→ n8n BIA v2 ainda pode operar em paralelo (sem conflito)
→ Atendentes humanos via MercadoPhone NÃO são interferidos
```

---

## Tarefa Pendente pelo Usuário

**Tarefa 7 — Manual:** Trocar a URL do webhook no painel MercadoPhone:
- Campo: **Webhook Principal**
- Novo valor: `https://crm.teknoscel.shop/api/webhooks/whatsapp`
- Verificação: enviar mensagem de teste e confirmar `{"ok":true}` + lead aparece no CRM

---

## Como Criar BIA v3 no Futuro (Checklist)

Quando quiser ativar a BIA operando pelo CRM (em vez do n8n direto):

```
[ ] 1. Criar workflow n8n "BIA AI Service v3"
        - Webhook de entrada: POST /bia-processar
        - Recebe: { leadId, leadNome, canal, mensagemCliente, contexto }
        - Processa com Claude/GPT
        - Chama de volta: POST https://crm.teknoscel.shop/api/webhooks/bia-response
          com header X-Bia-Secret: <valor do BIA_SECRET>
          com body: { lead_id, respostas: [{ texto }], metadata }

[ ] 2. Setar BIA_WEBHOOK_URL no .env da VPS:
        BIA_WEBHOOK_URL=https://n8n.teknoscel.shop/webhook/bia-processar

[ ] 3. Testar com BIA_MODE=observer ainda:
        curl -X POST https://n8n.teknoscel.shop/webhook/bia-processar \
          -d '{"leadId":"test","mensagemCliente":"oi","canal":"whatsapp","contexto":[]}'
        → confirma que n8n responde e chama /api/webhooks/bia-response corretamente

[ ] 4. Testar bia-response manualmente:
        curl -X POST https://crm.teknoscel.shop/api/webhooks/bia-response \
          -H "X-Bia-Secret: <BIA_SECRET>" \
          -H "Content-Type: application/json" \
          -d '{"lead_id":"<id real>","respostas":[{"texto":"Olá, teste BIA v3"}]}'
        → confirma {"ok":true} e mensagem chega no WhatsApp do lead

[ ] 5. Ativar no .env da VPS:
        BIA_MODE=active

[ ] 6. Recriar container para pegar novo env:
        cd /opt/teknos-crm
        docker compose up -d --no-deps backend
        docker logs teknos_backend | tail -5  # confirma startup limpo

[ ] 7. Monitorar logs por 30 min:
        docker logs -f teknos_backend | grep -E "bia-dispatcher|bia-response|ERROR"

[ ] 8. Desativar workflow BIA v2 no n8n (para evitar dupla resposta)
```

---

## Como Ativar Instagram/Messenger no Futuro

Os adapters já existem como stubs. Para ativar:

```
[ ] 1. Criar Meta App em developers.facebook.com
[ ] 2. Configurar Webhook com URL: https://crm.teknoscel.shop/api/webhooks/instagram
        (ou /messenger para Messenger)
[ ] 3. Setar no .env da VPS:
        META_APP_SECRET=<secret do app>
        META_VERIFY_TOKEN=<token de verificação>
        META_PAGE_ACCESS_TOKEN=<token da página>
[ ] 4. Implementar parseWebhook em:
        backend/src/channels/instagram/parser.js
        backend/src/channels/instagram/sender.js
        (atualmente retornam placeholders)
[ ] 5. Recriar container backend
[ ] 6. Verificar challenge GET: curl https://crm.teknoscel.shop/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test
[ ] 7. Testar mensagem real
```

---

## Melhorias Identificadas mas Não Implementadas

Itens técnicos que ficaram fora do escopo deste refactor:

| Item | Prioridade | Notas |
|---|---|---|
| Testes de aceitação T1–T6 (Tarefa 9) | Alta | Validar com mensagem real do MercadoPhone |
| Prisma migrate deploy com schema VPS | Média | Container tem 6 migrations baked; novas migrations precisam de rebuild ou `docker cp` |
| Enforcement de assinatura META_APP_SECRET | Média | Atualmente warn-not-block — TODO no código |
| Enforcement do OUTGOING_WEBHOOK_SECRET | Média | Mesma situação |
| Rate limiting nos endpoints de webhook | Média | Sem proteção contra flood |
| Persistência de `externalTicketId` no Lead | Baixa | Campo `chamadoId` do MercadoPhone não é persistido ainda |
| UI de gestão de `ChannelConfig` | Baixa | Tabela existe no banco mas sem CRUD no frontend |
| Limpeza de leads duplicados no banco | Baixa | "Daniel" e "Cliente Teste" ambos com phone 5514991664662 — dedup por (canal, identifier_canal) correto daqui em diante |
| Notificação quando atendente humano assume ticket | Baixa | `isHumanAttendantOnMercadoPhone` detectado mas não exposto no frontend |
| Logs estruturados (JSON) | Baixa | Console.log simples atualmente |

---

## Métricas do Refactor

| Métrica | Valor |
|---|---|
| Commits totais | 16 |
| Arquivos criados | ~20 novos |
| Arquivos modificados | ~18 existentes |
| Linhas adicionadas | +1.306 |
| Linhas removidas | -112 |
| Migrations aplicadas | 3 novas (000001, 000002, 000003) |
| Testes criados | 5 (node:test, zero deps extras) |
| Bugs críticos corrigidos | 2 (migration NULL + Prisma Client stale) |
| Duração total | ~7,5 horas (1 sessão, 2026-05-22) |

---

## Arquivos-Chave do Refactor

```
backend/prisma/schema.prisma              ← schema omnichannel com enums Channel, MessageTipo
backend/prisma/migrations/
  20260522000001_omnichannel_foundation/  ← WebhookEvent, Lead.canal, Message.canal, ChannelConfig fix
  20260522000002_add_messenger_tiktok/    ← ADD VALUE ao enum Channel
  20260522000003_sync_channel_configs/    ← no-op de documentação
backend/src/channels/
  base.js                                 ← ChannelAdapter base class
  index.js                                ← registry getAdapter(canal)
  whatsapp/{adapter,parser,sender}.js     ← parser com acao+fromMe+userId discrimination
  instagram|messenger|tiktok/...          ← stubs prontos para implementar
backend/src/core/
  ingestion.js                            ← switch(kind) + BIA_MODE guard
  bia-dispatcher.js                       ← delay grouper 8s com Map+setTimeout
  outbound.js                             ← sendToCustomer via adapter
backend/src/routes/webhooks.js            ← 5 endpoints + bia-response novo payload
backend/tests/
  ingestion.test.js                       ← 5 testes parser (node:test)
  fixtures/mercadophone/
    01-start.json | 02-cliente-msg.json | 03-bia-echo.json
frontend/src/
  components/common/ChannelBadge.tsx
  components/notifications/ToastContainer.tsx
  hooks/useNotifications.ts               ← Web Audio beep + localStorage sound toggle
  lib/utils.ts                            ← CHANNEL_META, formatPhone, formatIdentifier
  app/settings/endpoints/page.tsx         ← reescrita com endpoints reais
docker-compose.yml                        ← BIA_MODE e vars BIA no environment backend
backend/.env.example                      ← documentação completa de todas as vars
```
