import prisma from "../lib/prisma.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function toE164Brazil(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.startsWith("0")) return "55" + digits.slice(1);
  return "55" + digits;
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function parseCSVText(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line, i) => {
    // Basic CSV: handles quoted fields
    const values = [];
    let cur = "", inQuote = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') {
        if (inQuote && line[ci + 1] === '"') { cur += '"'; ci++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        values.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    values.push(cur.trim());
    const row = { _line: i + 2 }; // line number in original file
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    return row;
  });
  return { headers, rows };
}

function buildWhere(q) {
  if (!q) return {};
  return {
    OR: [
      { nome: { contains: q, mode: "insensitive" } },
      { telefone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
    ],
  };
}

const VALID_CANAIS = ["whatsapp", "instagram", "messenger", "telegram", "outro"];

// ── routes ────────────────────────────────────────────────────────────────────

export default async function contactRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── Importar CSV ────────────────────────────────────────────────────────────
  fastify.post("/api/contacts/import", auth, async (req, reply) => {
    const part = await req.file().catch(() => null);
    if (!part) return reply.code(400).send({ error: "arquivo csv nao enviado" });

    const buffer = await part.toBuffer();
    const text = buffer.toString("utf-8");
    const { headers, rows } = parseCSVText(text);

    if (!headers.includes("nome")) {
      return reply.code(400).send({ error: "CSV inválido — header 'nome' obrigatório" });
    }

    let imported = 0, updated = 0;
    const errors = [];

    for (const row of rows) {
      const nome = row.nome?.trim();
      if (!nome) { errors.push({ linha: row._line, erro: "nome obrigatório" }); continue; }

      const email = row.email?.trim() || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ linha: row._line, erro: `email inválido: "${email}"` }); continue;
      }

      const canal = row.canal?.trim().toLowerCase() || "whatsapp";
      const telefone = row.telefone ? toE164Brazil(row.telefone) : null;

      if (canal === "whatsapp" && !telefone) {
        errors.push({ linha: row._line, erro: "telefone obrigatório para canal whatsapp" }); continue;
      }

      try {
        const existing = telefone
          ? await prisma.contact.findFirst({ where: { telefone, canal } })
          : null;

        if (existing) {
          await prisma.contact.update({
            where: { id: existing.id },
            data: { nome, email, canal },
          });
          updated++;
        } else {
          await prisma.contact.create({ data: { nome, email, canal, telefone: telefone || null, tags: [] } });
          imported++;
        }
      } catch (err) {
        errors.push({ linha: row._line, erro: err.message.slice(0, 80) });
      }
    }

    console.log(`[contacts:import] imported=${imported} updated=${updated} errors=${errors.length}`);
    return { imported, updated, errors };
  });

  // ── Exportar CSV ────────────────────────────────────────────────────────────
  fastify.get("/api/contacts/export", auth, async (req, reply) => {
    const { q } = req.query;
    const contacts = await prisma.contact.findMany({
      where: buildWhere(q),
      orderBy: { nome: "asc" },
    });

    const header = "nome,telefone,email,canal,criado_em,tags";
    const rows = contacts.map((c) =>
      [
        csvEscape(c.nome),
        csvEscape(c.telefone || ""),
        csvEscape(c.email || ""),
        csvEscape(c.canal || ""),
        c.criadoEm.toISOString(),
        csvEscape((c.tags || []).join(";")),
      ].join(",")
    );

    const csv = [header, ...rows].join("\n");
    const date = new Date().toISOString().split("T")[0];

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="contatos-teknos-${date}.csv"`);
    return reply.send(csv);
  });

  // ── Listar ──────────────────────────────────────────────────────────────────
  fastify.get("/api/contacts", auth, async (req) => {
    const { q, page = 1, limit = 50 } = req.query;
    const where = buildWhere(q);

    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { nome: "asc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
    ]);
    return { total, contacts };
  });

  // ── Criar ───────────────────────────────────────────────────────────────────
  fastify.post("/api/contacts", auth, async (req, reply) => {
    const { nome, telefone, email, canal = "whatsapp", tags = [] } = req.body ?? {};

    if (!nome?.trim()) return reply.code(400).send({ error: "nome obrigatorio" });

    const normalizedPhone = telefone ? toE164Brazil(telefone) : null;

    if (canal === "whatsapp" && !normalizedPhone) {
      return reply.code(400).send({ error: "telefone obrigatorio para canal whatsapp" });
    }

    if (email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return reply.code(400).send({ error: "email invalido" });
    }

    // Upsert por telefone+canal
    if (normalizedPhone) {
      const existing = await prisma.contact.findFirst({ where: { telefone: normalizedPhone, canal } });
      if (existing) {
        const updated = await prisma.contact.update({
          where: { id: existing.id },
          data: {
            nome: nome.trim(),
            email: email?.trim() || null,
            tags: tags || [],
          },
        });
        return reply.code(200).send({ ...updated, _upserted: true });
      }
    }

    const contact = await prisma.contact.create({
      data: {
        nome: nome.trim(),
        telefone: normalizedPhone,
        email: email?.trim() || null,
        canal,
        tags: tags || [],
      },
    });
    return reply.code(201).send(contact);
  });

  // ── Editar ──────────────────────────────────────────────────────────────────
  fastify.put("/api/contacts/:id", auth, async (req, reply) => {
    const { id } = req.params;
    const { nome, telefone, email, canal, tags } = req.body ?? {};

    if (nome !== undefined && !nome?.trim()) {
      return reply.code(400).send({ error: "nome nao pode ser vazio" });
    }

    if (email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return reply.code(400).send({ error: "email invalido" });
    }

    const data = {};
    if (nome !== undefined) data.nome = nome.trim();
    if (telefone !== undefined) data.telefone = telefone ? toE164Brazil(telefone) : null;
    if (email !== undefined) data.email = email?.trim() || null;
    if (canal !== undefined) data.canal = canal;
    if (tags !== undefined) data.tags = tags;

    try {
      const contact = await prisma.contact.update({ where: { id }, data });
      return contact;
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "contato nao encontrado" });
      throw err;
    }
  });

  // ── Deletar ─────────────────────────────────────────────────────────────────
  fastify.delete("/api/contacts/:id", auth, async (req, reply) => {
    const { id } = req.params;
    try {
      await prisma.contact.delete({ where: { id } });
      return { ok: true };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "contato nao encontrado" });
      throw err;
    }
  });
}
