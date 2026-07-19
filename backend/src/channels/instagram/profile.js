import { getSetting } from '../../lib/settings-cache.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';

// Cache simples em memória: igUserId → { name, at }. Meta não manda o nome no
// webhook, então buscamos via Graph API 1x por contato (TTL longo — nome muda pouco).
const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Retorna o melhor nome disponível (name || username) ou null. Nunca lança:
// se o token faltar ou a Graph API falhar, devolve null e o lead fica com o id.
export async function resolveInstagramName(igUserId) {
  if (!igUserId) return null;

  const hit = cache.get(igUserId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.name;

  const token = getSetting('META_GRAPH_TOKEN');
  if (!token) return null;

  try {
    const url = `${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}?fields=name,username&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[instagram:profile] lookup HTTP ${res.status} para ${igUserId}:`, data?.error?.message || '');
      return null;
    }
    const name = data?.name || data?.username || null;
    cache.set(igUserId, { name, at: Date.now() });
    return name;
  } catch (err) {
    console.warn(`[instagram:profile] erro no lookup ${igUserId}:`, err.message);
    return null;
  }
}
