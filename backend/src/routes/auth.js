import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

const ACCESS_TOKEN_TTL = "7d";
const REFRESH_TOKEN_DAYS = 60;

const COOKIE_NAME = "refreshToken";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60,
};

function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_DAYS);
  return d;
}

export default async function authRoutes(fastify) {
  fastify.post("/api/auth/login", {
    schema: {
      body: {
        type: "object",
        required: ["email", "senha"],
        properties: {
          email: { type: "string", format: "email" },
          senha: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { email, senha } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.ativo) {
      return reply.code(401).send({ error: "Credenciais inválidas" });
    }

    const valid = await bcrypt.compare(senha, user.senhaHash);
    if (!valid) return reply.code(401).send({ error: "Credenciais inválidas" });

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, nivel: user.nivel },
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    const refreshToken = randomUUID();
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: refreshExpiresAt() },
    });

    reply.setCookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { token, refreshToken, user: { id: user.id, nome: user.nome, email: user.email, nivel: user.nivel } };
  });

  fastify.post("/api/auth/refresh", async (req, reply) => {
    const refreshToken = req.cookies?.[COOKIE_NAME] ?? req.body?.refreshToken;
    if (!refreshToken) return reply.code(401).send({ error: "Sem refresh token" });

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      reply.clearCookie(COOKIE_NAME, { path: COOKIE_OPTS.path });
      return reply.code(401).send({ error: "Refresh token inválido ou expirado" });
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.ativo) {
      await prisma.refreshToken.delete({ where: { token: refreshToken } });
      reply.clearCookie(COOKIE_NAME, { path: COOKIE_OPTS.path });
      return reply.code(401).send({ error: "Usuário inativo" });
    }

    // Reusable refresh token: same value até expiresAt original (evita race entre abas/devices).
    // Apenas reemite o access token; o cookie do navegador continua válido até o login expirar.
    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, nivel: user.nivel },
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    return { token, user: { id: user.id, nome: user.nome, email: user.email, nivel: user.nivel } };
  });

  fastify.post("/api/auth/logout", async (req, reply) => {
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {});
    }
    reply.clearCookie(COOKIE_NAME, { path: COOKIE_OPTS.path });
    return { ok: true };
  });
}
