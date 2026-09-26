import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { loadSettings, INTEGRATION_KEYS, SECRET_KEYS, getSetting } from "../lib/settings-cache.js";

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return value.slice(0, 4) + "•".repeat(Math.min(value.length - 8, 16)) + value.slice(-4);
}

export default async function integrationRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET — devolve estado de todas as chaves de integracao.
  // Secrets ficam mascarados; UI mostra valor parcial.
  fastify.get("/api/integrations/settings", auth, async (req, reply) => {
    if (req.user.nivel !== "admin") {
      return reply.code(403).send({ error: "Apenas administradores podem ver integrações" });
    }

    const dbRows = await prisma.setting.findMany({
      where: { chave: { in: INTEGRATION_KEYS } },
    });
    const dbMap = new Map(dbRows.map((r) => [r.chave, r.valor]));

    const items = INTEGRATION_KEYS.map((key) => {
      const dbVal = dbMap.get(key);
      const envVal = process.env[key];
      const raw = (dbVal !== undefined && dbVal !== "") ? dbVal : (envVal || "");
      const source = (dbVal !== undefined && dbVal !== "") ? "db" : (envVal ? "env" : null);
      const isSecret = SECRET_KEYS.has(key);
      return {
        key,
        defined: !!raw,
        secret: isSecret,
        value: isSecret ? maskSecret(raw) : raw,
        source,
      };
    });

    return { items };
  });

  // PUT — atualiza settings. Exige re-confirmacao da senha admin.
  // Body: { password: "...", updates: { CHAVE: "valor", ... } }
  fastify.put("/api/integrations/settings", auth, async (req, reply) => {
    if (req.user.nivel !== "admin") {
      return reply.code(403).send({ error: "Apenas administradores podem editar integrações" });
    }

    const { password, updates } = req.body || {};
    if (!password) return reply.code(400).send({ error: "Senha obrigatória" });
    if (!updates || typeof updates !== "object") {
      return reply.code(400).send({ error: "updates obrigatorio (objeto chave/valor)" });
    }

    // Valida senha do admin logado
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return reply.code(401).send({ error: "Usuário não encontrado" });
    const valid = await bcrypt.compare(password, user.senhaHash);
    if (!valid) return reply.code(403).send({ error: "Senha incorreta" });

    // Filtra apenas chaves permitidas (whitelist)
    const allowed = new Set(INTEGRATION_KEYS);
    const ops = [];
    const applied = [];
    for (const [chave, valor] of Object.entries(updates)) {
      if (!allowed.has(chave)) continue;
      const strVal = valor == null ? "" : String(valor);
      // Se o usuario apaga o campo (valor vazio), removemos do DB pra cair no fallback do .env.
      if (strVal === "") {
        ops.push(prisma.setting.deleteMany({ where: { chave } }));
      } else {
        ops.push(prisma.setting.upsert({
          where: { chave },
          update: { valor: strVal },
          create: { chave, valor: strVal },
        }));
      }
      applied.push(chave);
    }
    await Promise.all(ops);
    await loadSettings();

    return { ok: true, applied };
  });

  // POST /api/integrations/test/:scope — testa conectividade rapida pra um servico.
  // Retorna ok/erro sem expor token. Implementacao por scope:
  //   - "bia": HEAD/GET no BIA_WEBHOOK_URL
  //   - "n8n": HEAD/GET no N8N_BIA_URL
  //   - "mercadophone-jwt": GET /contacts/nt?searchParam=teste com o JWT configurado
  fastify.post("/api/integrations/test/:scope", auth, async (req, reply) => {
    if (req.user.nivel !== "admin") return reply.code(403).send({ error: "Acesso negado" });
    const { scope } = req.params;
    let url = null;
    if (scope === "bia") url = getSetting("BIA_WEBHOOK_URL");
    else if (scope === "n8n") url = getSetting("N8N_BIA_URL");
    else if (scope === "waha") {
      url = `${(getSetting("WAHA_URL") || "").replace(/\/+$/, "")}/ping`;
    }
    else if (scope === "mercadophone-jwt") {
      const jwt = getSetting("MERCADOPHONE_JWT");
      if (!jwt) return reply.code(400).send({ ok: false, error: "MERCADOPHONE_JWT não configurado" });
      const baseUrl = getSetting("MERCADOPHONE_API_URL", "https://exclusivoapi.mercadophone.tech");
      try {
        const res = await fetch(`${baseUrl}/contacts/nt?searchParam=teste`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (res.ok || res.status === 404) return { ok: true, status: res.status };
        const data = await res.json().catch(() => ({}));
        return reply.code(502).send({ ok: false, status: res.status, error: data?.message || `HTTP ${res.status}` });
      } catch (err) {
        return reply.code(502).send({ ok: false, error: err.message });
      }
    } else {
      return reply.code(400).send({ error: "scope invalido" });
    }
    if (!url) return reply.code(400).send({ error: "URL nao configurada" });
    try {
      const res = await fetch(url, { method: "GET" });
      return { ok: true, status: res.status };
    } catch (err) {
      return reply.code(502).send({ ok: false, error: err.message });
    }
  });

  // GET /api/integrations/mercadophone-jwt-status — verifica expiry do JWT (acessível a todos logados)
  fastify.get("/api/integrations/mercadophone-jwt-status", auth, async (_req, reply) => {
    const jwt = getSetting("MERCADOPHONE_JWT");
    if (!jwt) return { configured: false, expiresAt: null, daysLeft: null };

    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) return { configured: true, expiresAt: null, daysLeft: null };
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (!payload.exp) return { configured: true, expiresAt: null, daysLeft: null };
      const expiresAt = new Date(payload.exp * 1000).toISOString();
      const daysLeft = Math.ceil((payload.exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
      return { configured: true, expiresAt, daysLeft };
    } catch {
      return { configured: true, expiresAt: null, daysLeft: null };
    }
  });
}
