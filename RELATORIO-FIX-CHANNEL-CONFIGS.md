# Relatório: Fix channel_configs / Prisma Client desatualizado

**Data:** 2026-05-22  
**Commit do fix:** `50013caa`

---

## Diagnóstico real (diferente do esperado)

O bug reportado apontava colunas faltantes em `channel_configs`. A investigação revelou o **oposto**:

### Estrutura real do banco (após migration 000001)

```
Table "public.channel_configs"
 id            | text
 canal         | Channel (enum)
 ativo         | boolean
 config        | jsonb          ← coluna NOVA, existe
 criado_em     | timestamp      ← coluna NOVA, existe
 atualizado_em | timestamp      ← coluna NOVA, existe
```

**Nenhuma coluna estava faltando.** O banco estava correto.

### Causa raiz

O **Prisma Client** dentro do container `teknos_backend` foi gerado a partir do schema **antigo** (baked na imagem Docker, antes das nossas migrations). Ele:

- Ainda esperava `token` e `webhook_url` (removidos na migration 000001)
- Não conhecia `WebhookEvent`, `Channel` enum (adicionados na migration 000001)

Isso aconteceu porque o procedimento de deploy por `docker cp` copiava apenas `src/` e migrations individuais, mas **nunca copiou `prisma/schema.prisma`** para dentro do container. O `npx prisma generate` rodado anteriormente usou o schema antigo.

### Sequência de erros observados

| Fase | Erro | Causa |
|---|---|---|
| Antes do fix | `channel_configs.token does not exist` | Client antigo buscava coluna removida |
| 1ª tentativa de fix | `Cannot read properties of undefined (reading 'findUnique')` | `prisma.webhookEvent` = undefined — modelo não existia no schema antigo do client |
| Após fix completo | **Nenhum erro Prisma** | Client regenerado do schema correto |

---

## Fix aplicado

```bash
# 1. Copiar schema.prisma atualizado para dentro do container
docker cp /opt/teknos-crm/backend/prisma/schema.prisma teknos_backend:/app/prisma/schema.prisma

# 2. Verificar que schema novo chegou (deve listar enum Channel com 5 valores)
docker exec teknos_backend grep -A6 "enum Channel" /app/prisma/schema.prisma

# 3. Regenerar Prisma Client a partir do schema correto
docker exec teknos_backend npx prisma generate

# 4. Reiniciar para carregar o novo client
docker compose restart backend
```

---

## Migration 000003 (no-op de documentação)

Arquivo: `backend/prisma/migrations/20260522000003_sync_channel_configs_columns/migration.sql`

```sql
-- No-op: colunas já existem. Usa DO $$ IF NOT EXISTS $$ para idempotência.
-- Registra o diagnóstico e serve de salvaguarda.
DO $$ BEGIN
  IF NOT EXISTS (...config...)    THEN ALTER TABLE ... ADD COLUMN config ...;    END IF;
  IF NOT EXISTS (...criado_em...) THEN ALTER TABLE ... ADD COLUMN criado_em ...; END IF;
  ...
END $$;
```

Não alterou nada no banco. Registrado em `_prisma_migrations` para rastreabilidade.

---

## Output do curl de teste

```
POST https://crm.teknoscel.shop/api/webhooks/whatsapp
Body: wid=wamid.FIX_TEST_001, nome=Pedro Fix, número=5514912345678

Resposta: {"ok":true}
HTTP: 200
```

---

## Output da query SELECT (confirmação de persistência)

```
            id             |   nome    |   telefone    |  canal   | identifier_canal |        criado_em
---------------------------+-----------+---------------+----------+------------------+-------------------------
 cmpgi7kby0001ilak689npt99 | Pedro Fix | 5514912345678 | whatsapp | 5514912345678    | 2026-05-22 05:53:33.358
(1 row)
```

Lead criado corretamente com `canal=whatsapp` e `identifier_canal` preenchido.

---

## Tail dos logs após fix

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "teknos_crm", schema "public" at "postgres:5432"
6 migrations found in prisma/migrations
No pending migrations to apply.
[backend] Listening on :3001
[bia-client] n8n status=404 body={"code":404,"message":"The requested webhook \"POST bia-processar\" is not registered."...}
```

**Sem erros Prisma após o fix.** O erro de `bia-client` é esperado — n8n ainda não tem o workflow "BIA AI Service v3" (Tarefa 5 pendente).

---

## Procedimento correto para próximos deploys de schema

Sempre que `prisma/schema.prisma` mudar:

```bash
# No Mac local:
rsync -az backend/prisma/ root@82.25.64.134:/opt/teknos-crm/backend/prisma/

# Na VPS:
docker cp /opt/teknos-crm/backend/prisma/schema.prisma teknos_backend:/app/prisma/schema.prisma
docker cp /opt/teknos-crm/backend/prisma/migrations/<nova_migration> teknos_backend:/app/prisma/migrations/
docker compose exec -T backend npx prisma migrate deploy
docker compose exec -T backend npx prisma generate   # ← não esquecer
docker compose restart backend
```

---

## Conclusão

**Fix funcionou.**

- Lead `Pedro Fix` persistido com `canal=whatsapp`, `identifier_canal=5514912345678`
- Zero erros Prisma nos logs após o fix
- BIA tenta acionar n8n e recebe 404 esperado (workflow v3 ainda não existe — Tarefa 5)
- Ingestão de mensagens WhatsApp está **operacional**
