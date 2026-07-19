# Teknos CRM

Sistema omnichannel de atendimento via WhatsApp com IA (Bia).

## Stack
- **Backend:** Node.js + Fastify + Prisma + Socket.io
- **Frontend:** Next.js 14 + Tailwind CSS
- **Banco:** PostgreSQL + Redis
- **IA:** Claude Sonnet (`claude-sonnet-4-20250514`)

## Deploy rápido no VPS

```bash
# 1. Clone e configure
git clone <repo> teknos-crm && cd teknos-crm
cp .env.example .env
nano .env  # preencha JWT_SECRET, ANTHROPIC_API_KEY, senhas

# 2. Deploy
bash deploy.sh

# 3. Nginx (opcional — SSL com certbot)
sudo cp nginx.conf /etc/nginx/sites-available/teknos-crm
sudo ln -s /etc/nginx/sites-available/teknos-crm /etc/nginx/sites-enabled/
sudo certbot --nginx -d crm.teknoscel.shop
sudo nginx -t && sudo systemctl reload nginx
```

## Variáveis obrigatórias (.env)

| Variável | Descrição |
|---|---|
| `JWT_SECRET` | Segredo JWT (mín. 32 chars) |
| `ANTHROPIC_API_KEY` | Chave API Anthropic |
| `POSTGRES_PASSWORD` | Senha do banco |
| `OUTGOING_WEBHOOK_URL` | URL envio mensagens WhatsApp |

## Webhook n8n / Bia → CRM

```
POST /api/public/leads/incoming
Content-Type: application/json

{
  "external_id": "wa_5511999999999",
  "nome": "João Silva",
  "telefone": "5511999999999",
  "canal_mensagem": "whatsapp",
  "mensagem": "Quero um carro",
  "interesse": "sedan",
  "faixa_investimento": "40k-60k",
  "vai_trocar": true
}
```

## Lead Scoring

| Critério | Peso |
|---|---|
| Faixa de investimento | 40% |
| Urgência (vai trocar) | 30% |
| Engajamento (nº mensagens) | 30% |

🔥 ≥ 70 · 🟡 40-69 · 🟢 < 40

## Disparo proativo via template HSM (leads do quiz de iPhone)

Quando um lead chega pelo quiz do site (`/api/leads/from-site-quiz`), o CRM está fora da janela 24h do WhatsApp. Em vez de tentar enviar uma mensagem livre (que seria bloqueada pela Meta), o CRM usa a API completa do MercadoPhone para disparar o template HSM aprovado `recomendacao_iphone_site`.

**Fluxo:**
1. Quiz é recebido → lead criado/atualizado no banco
2. CRM chama a API do MercadoPhone: cria/encontra contato → abre ticket com template HSM
3. Lead fica marcado como `aguardandoPrimeiraResposta = true`
4. Quando o cliente responde (qualquer mensagem), a janela 24h abre
5. O CRM intercepta a primeira mensagem, injeta uma mensagem sintética rica com os dados do quiz
6. A Bia (n8n) recebe a mensagem sintética e responde normalmente

### Como renovar o JWT do MercadoPhone (a cada 30 dias)

O JWT para a API completa do MercadoPhone expira a cada 30 dias e precisa ser renovado manualmente:

1. Acesse `exclusivo.mercadophone.tech` e faça login
2. Abra o DevTools (F12) → aba **Network** → recarregue a página
3. Clique em qualquer requisição para a API
4. Copie o valor do header `Authorization` **sem** o prefixo `"Bearer "`
5. No CRM: **Configurações → MercadoPhone API JWT** → cole o token → salve
6. O painel mostra a data de expiração e avisa quando faltam menos de 5 dias

**O dashboard exibe um banner de alerta** quando o JWT estiver próximo de expirar (≤ 5 dias) ou já expirado.

### Variáveis relacionadas ao disparo proativo

| Variável | Onde configurar | Valor padrão |
|---|---|---|
| `MERCADOPHONE_JWT` | UI (Configurações → MercadoPhone API JWT) | — |
| `MERCADOPHONE_API_URL` | UI (Integrações) ou `.env` | `https://exclusivoapi.mercadophone.tech` |
| `MERCADOPHONE_WHATSAPP_ID` | UI (Integrações) ou `.env` | `185` |
| `MERCADOPHONE_QUEUE_ID` | UI (Integrações) ou `.env` | `85` |
| `MERCADOPHONE_USER_ID` | UI (Integrações) ou `.env` | `161` |

## Portas

| Serviço | Porta |
|---|---|
| Frontend | 3000 |
| Backend | 3001 |
| PostgreSQL | 5432 |
| Redis | 6379 |
