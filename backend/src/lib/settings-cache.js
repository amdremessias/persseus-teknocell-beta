import prisma from "./prisma.js";

// In-memory cache: precedence is DB > process.env > fallback.
// Reloaded on boot e em todo PUT /api/integrations/settings.
const cache = new Map();
let loaded = false;

export async function loadSettings() {
  try {
    const rows = await prisma.setting.findMany();
    cache.clear();
    for (const r of rows) cache.set(r.chave, r.valor);
    loaded = true;
  } catch (err) {
    console.error("[settings-cache] load failed:", err.message);
  }
}

function read(key) {
  const dbVal = cache.get(key);
  if (dbVal !== undefined && dbVal !== null && dbVal !== "") return dbVal;
  const envVal = process.env[key];
  if (envVal !== undefined && envVal !== "") return envVal;
  return undefined;
}

export function getSetting(key, fallback = undefined) {
  const v = read(key);
  return v === undefined ? fallback : v;
}

export function getSettingInt(key, fallback) {
  const v = read(key);
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

export function getSettingBool(key, fallback = false) {
  const v = read(key);
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

export function isLoaded() {
  return loaded;
}

// Lista de chaves expostas via UI de integracoes — usado pra GET filtrar settings nao-sensiveis.
export const INTEGRATION_KEYS = [
  // Bia / n8n
  "BIA_MODE",
  "BIA_WEBHOOK_URL",
  "BIA_SECRET",
  "BIA_GROUPING_DELAY_MS",
  "BIA_INTER_MESSAGE_DELAY_MS",
  "N8N_BIA_URL",
  // Anthropic
  "ANTHROPIC_API_KEY",
  "CLAUDE_MODEL",
  // MercadoPhone (WhatsApp) — envio de mensagens dentro da janela 24h
  "MERCADOPHONE_URL",
  "MERCADOPHONE_TOKEN",
  "OUTGOING_WEBHOOK_URL",
  "OUTGOING_WEBHOOK_SECRET",
  // MercadoPhone API — disparo proativo via template HSM (JWT renovado a cada 30 dias)
  "MERCADOPHONE_JWT",
  "MERCADOPHONE_API_URL",
  "MERCADOPHONE_WHATSAPP_ID",
  "MERCADOPHONE_QUEUE_ID",
  "MERCADOPHONE_USER_ID",
  // Meta Instagram
  "META_GRAPH_TOKEN",
  "IG_PAGE_ID",
  "META_VERIFY_TOKEN_INSTAGRAM",
  "META_APP_SECRET_INSTAGRAM",
  "BIA_INSTAGRAM_ENABLED",
  // Meta Messenger
  "META_MESSENGER_TOKEN",
  "MESSENGER_PAGE_ID",
  "META_VERIFY_TOKEN_MESSENGER",
  // Facebook
  "METAFB_TOKEN",
  // TikTok
  "TIKTOK_TOKEN",
  // WAHA (WhatsApp HTTP API) — gateway WPP local (community)
  "WPP_PROVIDER",
  "WAHA_URL",
  "WAHA_SESSION",
  "WAHA_API_KEY",
  // Verify token compartilhado legado (Meta)
  "META_VERIFY_TOKEN",
  // Sync de mensagens do MercadoPhone — kill switch ("true"/"false", default true)
  "message_sync_enabled",
];

// Chaves que sao secrets / tokens — UI deve mascarar.
export const SECRET_KEYS = new Set([
  "BIA_SECRET",
  "ANTHROPIC_API_KEY",
  "MERCADOPHONE_TOKEN",
  "MERCADOPHONE_JWT",
  "OUTGOING_WEBHOOK_SECRET",
  "META_GRAPH_TOKEN",
  "META_APP_SECRET_INSTAGRAM",
  "META_MESSENGER_TOKEN",
  "METAFB_TOKEN",
  "TIKTOK_TOKEN",
  "META_VERIFY_TOKEN_INSTAGRAM",
  "META_VERIFY_TOKEN_MESSENGER",
  "META_VERIFY_TOKEN",
  "WAHA_API_KEY",
]);

// Indica se um valor existe (mesmo mascarado) — pra UI sinalizar "definido"
export function isDefined(key) {
  return read(key) !== undefined;
}
