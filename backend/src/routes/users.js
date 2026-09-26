import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { PERMISSIONS, isAdmin } from "../lib/permissions.js";

const PUBLIC_SELECT = {
  id: true,
  nome: true,
  email: true,
  nivel: true,
  ativo: true,
  avatarUrl: true,
  permissions: true,
  lastPasswordChange: true,
  criadoEm: true,
};

function validPassword(senha) {
  if (!senha || String(senha).length < 6) return "senha deve ter ao menos 6 caracteres";
  return null;
}

export default async function userRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };
  const admin = { onRequest: [fastify.authenticate], preHandler: async (req, reply) => {
    if (!isAdmin(req.user)) return reply.code(403).send({ error: "Acesso restrito a administradores" });
  }};

  // Catálogo de permissões (para montar a tela)
  fastify.get("/api/users/permissions", auth, async () => ({ permissions: PERMISSIONS }));

  // Usuário logado (perfil + permissões efetivas + grupos/filas)
  fastify.get("/api/users/me", auth, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return { user: null };
    const { senhaHash, ...safe } = user;
    return { user: safe };
  });

  fastify.get("/api/users", auth, async () => {
    return prisma.user.findMany({ select: PUBLIC_SELECT, orderBy: { nome: "asc" } });
  });

  fastify.post("/api/users", admin, async (req, reply) => {
    const { nome, email, senha, nivel, ativo, permissions, avatarUrl } = req.body ?? {};
    if (!nome?.trim() || !email?.trim()) return reply.code(400).send({ error: "nome e email obrigatorios" });
    if (!nivel) return reply.code(400).send({ error: "nivel obrigatorio" });
    const pwdErr = validPassword(senha);
    if (pwdErr) return reply.code(400).send({ error: pwdErr });

    const senhaHash = await bcrypt.hash(senha, 10);
    try {
      const user = await prisma.user.create({
        data: {
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          senhaHash,
          nivel,
          ativo: ativo !== undefined ? ativo : true,
          ...(Array.isArray(permissions) ? { permissions } : {}),
          avatarUrl: avatarUrl || null,
          lastPasswordChange: new Date(),
        },
        select: PUBLIC_SELECT,
      });
      return reply.code(201).send(user);
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "Email já cadastrado" });
      throw err;
    }
  });

  fastify.put("/api/users/:id", auth, async (req, reply) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: "Usuário não encontrado" });

    const isSelf = req.user.id === req.params.id;
    if (!isAdmin(req.user) && !isSelf) {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const { nome, email, senha, nivel, ativo, permissions, avatarUrl } = req.body ?? {};
    const data = {};

    // Auto-edição: só permite nome/avatar. Admin pode tudo.
    if (!isAdmin(req.user)) {
      if (nome !== undefined) data.nome = String(nome).trim();
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
    } else {
      if (nome !== undefined) data.nome = String(nome).trim();
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
      if (email !== undefined) data.email = String(email).trim().toLowerCase();
      if (nivel !== undefined) data.nivel = nivel;
      if (ativo !== undefined) data.ativo = !!ativo;
      if (permissions !== undefined) data.permissions = Array.isArray(permissions) ? permissions : [];
      if (senha) {
        const pwdErr = validPassword(senha);
        if (pwdErr) return reply.code(400).send({ error: pwdErr });
        data.senhaHash = await bcrypt.hash(senha, 10);
        data.lastPasswordChange = new Date();
        data.passwordResetToken = null;
        data.passwordResetExpires = null;
      }
    }

    try {
      const user = await prisma.user.update({ where: { id: req.params.id }, data, select: PUBLIC_SELECT });
      return user;
    } catch (err) {
      if (err.code === "P2002") return reply.code(409).send({ error: "Email já cadastrado" });
      throw err;
    }
  });

  // Reset de senha por admin (definir uma nova senha conhecida)
  fastify.post("/api/users/:id/reset-password", admin, async (req, reply) => {
    const { senha } = req.body ?? {};
    const pwdErr = validPassword(senha);
    if (pwdErr) return reply.code(400).send({ error: pwdErr });

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: "Usuário não encontrado" });

    const senhaHash = await bcrypt.hash(senha, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { senhaHash, lastPasswordChange: new Date(), passwordResetToken: null, passwordResetExpires: null },
    });
    return { ok: true };
  });

  // Troca de senha pelo próprio usuário
  fastify.post("/api/users/change-password", auth, async (req, reply) => {
    const { senhaAtual, novaSenha } = req.body ?? {};
    const pwdErr = validPassword(novaSenha);
    if (pwdErr) return reply.code(400).send({ error: pwdErr });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return reply.code(404).send({ error: "Usuário não encontrado" });

    const valid = await bcrypt.compare(senhaAtual || "", user.senhaHash);
    if (!valid) return reply.code(401).send({ error: "Senha atual incorreta" });

    await prisma.user.update({
      where: { id: user.id },
      data: { senhaHash: await bcrypt.hash(novaSenha, 10), lastPasswordChange: new Date() },
    });
    return { ok: true };
  });

  fastify.delete("/api/users/:id", admin, async (req, reply) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: "Usuário não encontrado" });
    if (target.nivel === "admin" && target.id !== req.user.id) {
      return reply.code(400).send({ error: "Não é possível desativar outro admin" });
    }
    await prisma.user.update({ where: { id: req.params.id }, data: { ativo: false } });
    return { ok: true };
  });
}