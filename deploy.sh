#!/usr/bin/env bash
set -e

echo "=== Teknos CRM Deploy ==="

# Requer .env no mesmo diretório
if [ ! -f ".env" ]; then
  echo "ERRO: .env não encontrado. Copie .env.example e preencha as variáveis."
  exit 1
fi

echo "→ Parando containers existentes..."
docker compose down --remove-orphans

echo "→ Construindo imagens..."
docker compose build --no-cache

echo "→ Subindo banco e redis primeiro..."
docker compose up -d postgres redis
echo "→ Aguardando banco ficar saudável..."
until docker compose exec -T postgres pg_isready -U "$(grep POSTGRES_USER .env | cut -d= -f2)" 2>/dev/null; do
  sleep 2
done

echo "→ Subindo todos os serviços..."
docker compose up -d

echo "→ Executando seed inicial..."
sleep 5
docker compose exec -T backend node src/seed.js || echo "Seed já executado ou falhou (normal na reinicialização)"

echo ""
echo "✅ Deploy concluído!"
echo "   Backend:  http://localhost:3001"
echo "   Frontend: http://localhost:3000"
echo ""
echo "Usuário admin padrão:"
echo "  Email: admin@teknoscel.shop"
echo "  Senha: admin123  ← TROQUE IMEDIATAMENTE!"
