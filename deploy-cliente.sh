#!/usr/bin/env bash
# ============================================================
# Teknos CRM — Deploy automatizado para NOVO CLIENTE
#
# Uso:
#   bash deploy-cliente.sh <DOMINIO>
#   bash deploy-cliente.sh crm.cliente.com.br
#   bash deploy-cliente.sh 10.0.0.20 --no-ssl          # IP/LAN interna
#   bash deploy-cliente.sh crm.cliente.com.br --ip 203.0.113.5 --user root
#
# O domínio/endereço DEVE ser informado no momento do deploy.
# Ele substitui mordorlab.internal.lan (local) em todas as URLs
# (frontend, API, websocket, uploads e build do Next).
#
# Segredos vêm do arquivo .env.deploy (não versionado). Para usar um
# conjunto de segredos por cliente:  --cliente <nome>  → lê .env.deploy.<nome>
#
# Flags:
#   --ip <IP>       IP do servidor (default: pega do .env.deploy como VPS_IP)
#   --user <user>   usuário SSH (default: root)
#   --dir <caminho> diretório no servidor (default: /opt/teknos-crm)
#   --email <email> email do Let's Encrypt (default: admin@DOMINIO)
#   --no-ssl        pula certbot (útil para IPs e domínios .lan/.internal)
#   --ssl           força certbot mesmo se parecer endereço interno
#   --no-cache      docker compose build --no-cache
#   --cliente <nome> usa .env.deploy.<nome> como segredos
# ============================================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Argumentos ───────────────────────────────────────────────
if [ "$#" -lt 1 ]; then
  echo "Uso: bash deploy-cliente.sh <DOMINIO> [opções]"
  echo "Ex.: bash deploy-cliente.sh crm.cliente.com.br --ip 203.0.113.5"
  exit 1
fi
DOMAIN="${1}"
shift

VPS_IP=""
VPS_USER="root"
APP_DIR="/opt/teknos-crm"
CERTBOT_EMAIL="admin@${DOMAIN}"
SSL_MODE="auto"
NO_CACHE=0
CLIENT_NAME=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ip)          VPS_IP="${2:-}"; shift 2 ;;
    --user)        VPS_USER="${2:-}"; shift 2 ;;
    --dir)         APP_DIR="${2:-}"; shift 2 ;;
    --email)       CERTBOT_EMAIL="${2:-}"; shift 2 ;;
    --no-ssl)      SSL_MODE="off"; shift ;;
    --ssl)         SSL_MODE="on"; shift ;;
    --no-cache)    NO_CACHE=1; shift ;;
    --cliente)     CLIENT_NAME="${2:-}"; shift 2 ;;
    *)             echo "Opção desconhecida: $1"; exit 1 ;;
  esac
done

# ── Segredos do deploy (não versionado) ─────────────────────
DEPLOY_ENV="${SRC_DIR}/.env.deploy"
if [ -n "${CLIENT_NAME}" ]; then
  DEPLOY_ENV="${SRC_DIR}/.env.deploy.${CLIENT_NAME}"
fi
if [ ! -f "${DEPLOY_ENV}" ]; then
  echo "ERRO: ${DEPLOY_ENV} não encontrado."
  echo "      Copie o template:  cp .env.deploy.example .env.deploy"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source "${DEPLOY_ENV}"
set +a

if [ -z "${VPS_IP}" ]; then
  VPS_IP="${VPS_IP:-${DEPLOY_VPS_IP:-}}"
fi
if [ -z "${VPS_IP}" ]; then
  read -r -p "IP do servidor (VPS_IP não definido): " VPS_IP
fi
if [ -z "${VPS_IP}" ]; then
  echo "ERRO: VPS_IP obrigatório (--ip <IP> ou VPS_IP no .env.deploy)."
  exit 1
fi

# ── Decide SSL ───────────────────────────────────────────────
# Endereços internos (IP puro, .lan, .internal) não têm DNS público → http.
is_external() {
  [[ "${DOMAIN}" =~ ^[0-9]+(\.[0-9]+){3}$ ]] && return 1
  [[ "${DOMAIN}" == *.lan ]] && return 1
  [[ "${DOMAIN}" == *.internal ]] && return 1
  [[ "${DOMAIN}" == *.local ]] && return 1
  return 0
}
if [ "${SSL_MODE}" = "auto" ]; then
  if is_external; then SSL_MODE="on"; else SSL_MODE="off"; fi
fi

SCHEME="http"
WS_SCHEME="ws"
if [ "${SSL_MODE}" = "on" ]; then
  SCHEME="https"
  WS_SCHEME="wss"
fi

echo ""
echo "┌────────────────────────────────────────────┐"
echo "│   Teknos CRM — Deploy novo cliente         │"
echo "└────────────────────────────────────────────┘"
echo "  Url:      ${SCHEME}://${DOMAIN}"
echo "  Servidor: ${VPS_USER}@${VPS_IP}:${APP_DIR}"
echo "  SSL:      ${SSL_MODE}"
echo ""

# ── [1] Sincroniza código para o servidor ──────────────────
echo "→ [1] Enviando código para ${VPS_IP}..."
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  --exclude '.git' \
  "${SRC_DIR}/" \
  "${VPS_USER}@${VPS_IP}:${APP_DIR}/"
echo "   ✓ Código enviado"

# ── [2] Cria .env no servidor com a nova URL ───────────────
echo "→ [2] Criando .env com URL ${SCHEME}://${DOMAIN}..."
ssh "${VPS_USER}@${VPS_IP}" "cat > ${APP_DIR}/.env" << ENVEOF
# Database
POSTGRES_DB=${POSTGRES_DB:-teknos_crm}
POSTGRES_USER=${POSTGRES_USER:-teknos}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h

# Node
NODE_ENV=production

# Anthropic / Claude
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
CLAUDE_MODEL=${CLAUDE_MODEL:-claude-sonnet-4-20250514}

# WhatsApp / provedor (WPP_PROVIDER: waha | mercadophone)
WPP_PROVIDER=${WPP_PROVIDER:-waha}
WAHA_URL=http://waha:3000
WAHA_SESSION=default
WAHA_API_KEY=${WAHA_API_KEY:-}
WAHA_DASHBOARD_USERNAME=${WAHA_DASHBOARD_USERNAME:-admin}
WAHA_DASHBOARD_PASSWORD=${WAHA_DASHBOARD_PASSWORD:-}
MERCADOPHONE_TOKEN=${MERCADOPHONE_TOKEN:-}
MERCADOPHONE_URL=https://exclusivoapi.mercadophone.tech/api/messages/sendOfficialData
OUTGOING_WEBHOOK_URL=
OUTGOING_WEBHOOK_SECRET=${OUTGOING_WEBHOOK_SECRET:-}

# Meta webhook
META_VERIFY_TOKEN=${META_VERIFY_TOKEN:-}

# URLs — apontam para o NOVO endereço deste cliente
FRONTEND_URL=${SCHEME}://${DOMAIN}
NEXT_PUBLIC_API_URL=${SCHEME}://${DOMAIN}/api
NEXT_PUBLIC_WS_URL=${WS_SCHEME}://${DOMAIN}
UPLOADS_URL=${SCHEME}://${DOMAIN}/api/uploads

# Bia Vendas — sistemas externos (links no menu). Lidos no build do frontend.
NEXT_PUBLIC_BIA_VENDAS_URL=${NEXT_PUBLIC_BIA_VENDAS_URL:-http://192.168.1.50:8080}
NEXT_PUBLIC_BIA_VENDAS_REMOTO_URL=${NEXT_PUBLIC_BIA_VENDAS_REMOTO_URL:-http://100.82.152.83:8080}

# Web Push VAPID
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY:-}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY:-}
VAPID_SUBJECT=mailto:${CERTBOT_EMAIL}

# Bia (IA) — repasse para o n8n. Sem URL fica em modo observer.
BIA_MODE=${BIA_MODE:-observer}
BIA_WEBHOOK_URL=${BIA_WEBHOOK_URL:-}
BIA_SECRET=${BIA_SECRET:-}
ENVEOF
echo "   ✓ .env criado"

# ── [3] Prepara servidor (Docker, Nginx, Certbot) ──────────
echo "→ [3] Preparando servidor..."
ssh "${VPS_USER}@${VPS_IP}" bash << 'REMOTE'
set -e

if ! command -v docker &>/dev/null; then
  echo "  Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version &>/dev/null 2>&1; then
  echo "  Instalando Docker Compose..."
  COMPOSE_VER="v2.27.1"
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
fi

if ! command -v nginx &>/dev/null; then
  echo "  Instalando Nginx..."
  apt-get update -qq && apt-get install -y -qq nginx
  systemctl enable nginx
fi

echo "  ✓ Dependências OK"
REMOTE

echo "   ✓ Servidor preparado"

# ── [4] Sobe containers ─────────────────────────────────────
echo "→ [4] Subindo Docker Compose..."
BUILD_FLAG=""
if [ "${NO_CACHE}" = "1" ]; then BUILD_FLAG="--no-cache"; fi
ssh "${VPS_USER}@${VPS_IP}" bash -s << REMOTE
set -e
cd ${APP_DIR}

docker compose down --remove-orphans 2>/dev/null || true
docker compose build ${BUILD_FLAG}
docker compose up -d

echo "  Aguardando containers ficarem saudáveis..."
sleep 10

docker compose ps

echo "  Executando seed..."
docker compose exec -T backend node src/seed.js 2>/dev/null || echo "  (seed já executado)"
REMOTE
echo "   ✓ Containers rodando"

# ── [5] Nginx — config HTTP base ────────────────────────────
echo "→ [5] Configurando Nginx para ${DOMAIN}..."
SITE_FILE="teknos-crm"
SERVER_NAME_LINE="${DOMAIN}"

# Bloco 80 padrão (também expõe /.well-known/acme-challenge/ para o certbot)
cat > /tmp/teknos-nginx-site << NGINXEOF
server {
    listen 80;
    server_name ${SERVER_NAME_LINE};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
    }

    location = /health {
        proxy_pass http://localhost:3001;
    }
}
NGINXEOF

scp /tmp/teknos-nginx-site "${VPS_USER}@${VPS_IP}:/etc/nginx/sites-available/${SITE_FILE}"
rm -f /tmp/teknos-nginx-site

ssh "${VPS_USER}@${VPS_IP}" bash -s << REMOTE
set -e
mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/${SITE_FILE} /etc/nginx/sites-enabled/${SITE_FILE}
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx
echo "  ✓ Nginx (HTTP) configurado"
REMOTE
echo "   ✓ Nginx OK"

# ── [5b] SSL — certbot webroot antes de ativar o bloco 443 ──
if [ "${SSL_MODE}" = "on" ]; then
  echo "→ Gerando certificado Let's Encrypt para ${DOMAIN}..."
  ssh "${VPS_USER}@${VPS_IP}" bash -s << REMOTE
set -e
if ! command -v certbot &>/dev/null; then
  apt-get install -y -qq certbot python3-certbot-nginx
fi
if [ ! -d /etc/letsencrypt/live/${DOMAIN} ]; then
  certbot certonly \
    --webroot -w /var/www/certbot \
    -d ${DOMAIN} \
    --non-interactive \
    --agree-tos \
    --email ${CERTBOT_EMAIL}
else
  echo "  Certificado já existe — renovando quando aplicável"
fi
REMOTE
  echo "   ✓ Certificado OK"

  echo "→ Ativando TLS (443) no Nginx..."
  cat > /tmp/teknos-nginx-site << NGINXEOF
server {
    listen 80;
    server_name ${SERVER_NAME_LINE};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${SERVER_NAME_LINE};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
    }

    location = /health {
        proxy_pass http://localhost:3001;
    }
}
NGINXEOF

  scp /tmp/teknos-nginx-site "${VPS_USER}@${VPS_IP}:/etc/nginx/sites-available/${SITE_FILE}"
  rm -f /tmp/teknos-nginx-site

  ssh "${VPS_USER}@${VPS_IP}" bash -s << REMOTE
set -e
nginx -t
systemctl reload nginx

# Renovação automática do certificado
cat > /etc/cron.d/certbot-renew << 'CRONEOF'
0 3 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"
CRONEOF
chmod 644 /etc/cron.d/certbot-renew
echo "  ✓ TLS ativado e renovação automática configurada"
REMOTE
  echo "   ✓ Nginx TLS OK"

else
  echo "→ [5b] SSL pulado (endereço interno / --no-ssl)"
fi

echo ""
echo "┌────────────────────────────────────────────┐"
echo "│  ✅  Deploy concluído com sucesso!         │"
echo "├────────────────────────────────────────────┤"
echo "│  Cliente URL: ${SCHEME}://${DOMAIN}"
echo "│  Servidor:    ${VPS_USER}@${VPS_IP}"
echo "│  Admin:       admin@teknoscel.shop"
echo "│  Senha:       admin123  ← TROQUE AGORA!    │"
echo "├────────────────────────────────────────────┤"
echo "│  IMPORTANTE: edite o .env no servidor e    │"
echo "│  adicione ANTHROPIC_API_KEY p/ ativar a IA │"
echo "└────────────────────────────────────────────┘"
echo ""

# Teste final
echo "→ Testando endpoint health..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SCHEME}://${DOMAIN}/health" 2>/dev/null || echo "000")
if [ "${HTTP_CODE}" = "200" ]; then
  echo "   ✓ Health check OK (HTTP 200)"
else
  echo "   ⚠ Health check retornou HTTP ${HTTP_CODE} — verifique os logs"
  echo "   Logs: ssh ${VPS_USER}@${VPS_IP} 'cd ${APP_DIR} && docker compose logs -f'"
  exit 1
fi