#!/usr/bin/env bash
# ============================================================
# Teknos CRM — Script de deploy completo para VPS
# Execute: bash deploy-vps.sh
# ============================================================
set -e

VPS_IP="82.25.64.134"
VPS_USER="root"
DOMAIN="crm.teknoscel.shop"
APP_DIR="/opt/teknos-crm"

# Carrega os segredos do deploy (arquivo NÃO versionado). Ver .env.deploy.example.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "${SCRIPT_DIR}/.env.deploy" ]; then
  echo "ERRO: ${SCRIPT_DIR}/.env.deploy não encontrado."
  echo "      Copie o template e preencha:  cp .env.deploy.example .env.deploy"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/.env.deploy"
set +a

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Teknos CRM — Deploy VPS          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Sincroniza código para o VPS ──────────────────────────
echo "→ [1/6] Enviando código para o VPS..."
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude '.env.deploy' \
  --exclude '*.log' \
  /Users/danielbueno/teknos-crm/ \
  ${VPS_USER}@${VPS_IP}:${APP_DIR}/

echo "   ✓ Código enviado"

# ── 2. Cria .env no VPS ──────────────────────────────────────
echo "→ [2/6] Criando .env no VPS..."
ssh ${VPS_USER}@${VPS_IP} "cat > ${APP_DIR}/.env" << ENVEOF
# Database
POSTGRES_DB=teknos_crm
POSTGRES_USER=teknos
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h

# Node
NODE_ENV=production

# Anthropic / Claude — PREENCHA COM SUA CHAVE
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
CLAUDE_MODEL=claude-sonnet-4-20250514

# WhatsApp / MercadoPhone
MERCADOPHONE_TOKEN=${MERCADOPHONE_TOKEN}
MERCADOPHONE_URL=https://exclusivoapi.mercadophone.tech/api/messages/sendOfficialData
OUTGOING_WEBHOOK_URL=
OUTGOING_WEBHOOK_SECRET=${OUTGOING_WEBHOOK_SECRET}

# Meta webhook
META_VERIFY_TOKEN=${META_VERIFY_TOKEN}

# URLs
FRONTEND_URL=https://crm.teknoscel.shop
NEXT_PUBLIC_API_URL=https://crm.teknoscel.shop/api
NEXT_PUBLIC_WS_URL=wss://crm.teknoscel.shop

# Web Push VAPID
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
VAPID_SUBJECT=mailto:admin@teknoscel.shop

# Bia (IA) — repasse de mensagens recebidas para o n8n
BIA_MODE=active
BIA_WEBHOOK_URL=https://n8n.teknoscel.shop/webhook/bia-teknos
BIA_SECRET=${BIA_SECRET}
ENVEOF

echo "   ✓ .env criado"

# ── 3. Prepara VPS (Docker, Nginx, Certbot) ──────────────────
echo "→ [3/6] Instalando dependências no VPS..."
ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE'
set -e

# Docker
if ! command -v docker &>/dev/null; then
  echo "  Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# Docker Compose v2
if ! docker compose version &>/dev/null 2>&1; then
  echo "  Instalando Docker Compose..."
  COMPOSE_VER="v2.27.1"
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
fi

# Nginx
if ! command -v nginx &>/dev/null; then
  echo "  Instalando Nginx..."
  apt-get update -qq && apt-get install -y -qq nginx
  systemctl enable nginx
fi

# Certbot
if ! command -v certbot &>/dev/null; then
  echo "  Instalando Certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# fail2ban — aplica jail.local versionado (ignoreip do admin) pra o IP de casa
# nunca ser banido e travar deploys futuros. Config em /opt/teknos-crm/fail2ban/.
if ! command -v fail2ban-client &>/dev/null; then
  echo "  Instalando fail2ban..."
  apt-get install -y -qq fail2ban || true
fi
if [ -f /opt/teknos-crm/fail2ban/jail.local ]; then
  cp /opt/teknos-crm/fail2ban/jail.local /etc/fail2ban/jail.local
  systemctl enable fail2ban 2>/dev/null || true
  systemctl restart fail2ban 2>/dev/null || true
  # Desbane já o IP do admin, caso esteja banido neste momento
  fail2ban-client set sshd unbanip 191.37.48.15 2>/dev/null || true
  echo "  ✓ fail2ban: ignoreip do admin aplicado"
fi

echo "  ✓ Dependências OK"
REMOTE

echo "   ✓ VPS preparado"

# ── 4. Sobe containers ───────────────────────────────────────
echo "→ [4/6] Subindo Docker Compose..."
ssh ${VPS_USER}@${VPS_IP} bash << REMOTE
set -e
cd ${APP_DIR}

docker compose down --remove-orphans 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

echo "  Aguardando containers ficarem saudáveis..."
sleep 10

docker compose ps

echo "  Executando seed..."
docker compose exec -T backend node src/seed.js 2>/dev/null || echo "  (seed já executado)"
REMOTE

echo "   ✓ Containers rodando"

# ── 5. Configura Nginx ───────────────────────────────────────
echo "→ [5/6] Configurando Nginx..."
ssh ${VPS_USER}@${VPS_IP} bash << REMOTE
set -e

cat > /etc/nginx/sites-available/teknos-crm << 'NGINXEOF'
server {
    listen 80;
    server_name crm.teknoscel.shop;

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

    location /health {
        proxy_pass http://localhost:3001;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/teknos-crm /etc/nginx/sites-enabled/teknos-crm
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx
echo "  ✓ Nginx configurado"
REMOTE

echo "   ✓ Nginx OK"

# ── 6. SSL com Certbot ───────────────────────────────────────
echo "→ [6/6] Gerando SSL com Certbot..."
ssh ${VPS_USER}@${VPS_IP} bash << REMOTE
set -e
certbot --nginx \
  -d crm.teknoscel.shop \
  --non-interactive \
  --agree-tos \
  --email admin@teknoscel.shop \
  --redirect

systemctl reload nginx
echo "  ✓ SSL configurado"
REMOTE

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅  Deploy concluído com sucesso!           ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  URL:   https://crm.teknoscel.shop           ║"
echo "║  Admin: admin@teknoscel.shop                 ║"
echo "║  Senha: admin123  ← TROQUE AGORA!            ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  IMPORTANTE: edite o .env no VPS e adicione ║"
echo "║  ANTHROPIC_API_KEY para ativar a IA          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Teste final
echo "→ Testando endpoint health..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://crm.teknoscel.shop/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✓ Health check OK (HTTP 200)"
else
  echo "   ⚠ Health check retornou HTTP ${HTTP_CODE} — verifique os logs"
  echo "   Logs: ssh root@82.25.64.134 'cd /opt/teknos-crm && docker compose logs -f'"
fi
