import bcrypt from "bcryptjs";
import prisma from "./lib/prisma.js";

async function main() {
  const senha = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@teknoscel.shop" },
    update: { senhaHash: senha },
    create: { nome: "Admin", email: "admin@teknoscel.shop", senhaHash: senha, nivel: "admin" },
  });
  console.log("Admin criado:", admin.email);

  await prisma.setting.createMany({
    data: [
      { chave: "horario_comercial", valor: JSON.stringify({ inicio: "08:00", fim: "18:00", dias: [1, 2, 3, 4, 5] }) },
      { chave: "empresa_nome", valor: "TeknosCel" },
      { chave: "sla_minutos", valor: "2" },
      { chave: "catalogo_pagamento", valor: JSON.stringify({
        desconto_pix: "5% OFF",
        parcelado: "até 12x",
        kit_protecao: "capa + película + película da câmera",
        garantia_novo: "1 ano Apple + 6 meses loja",
        garantia_seminovo: "6 meses loja",
      })},
    ],
    skipDuplicates: true,
  });
  console.log("Settings inseridas");

  await prisma.channelConfig.createMany({
    data: [
      { canal: "whatsapp", ativo: false },
      { canal: "messenger", ativo: false },
      { canal: "instagram", ativo: false },
      { canal: "tiktok", ativo: false },
    ],
    skipDuplicates: true,
  });
  console.log("Channels criados");

  // Time e fila padrão para a segmentação de atendimento (Admin: Grupos/Filas)
  const team = await prisma.team.upsert({
    where: { nome: "Atendimento" },
    update: {},
    create: { nome: "Atendimento", descricao: "Time padrão de atendimento", cor: "#1B5E20" },
  });
  const queue = await prisma.attendanceQueue.upsert({
    where: { nome: "Geral" },
    update: { teamId: team.id },
    create: {
      nome: "Geral",
      descricao: "Fila padrão de atendimento",
      cor: "#1B5E20",
      teamId: team.id,
      estrategiaAtribuicao: "round_robin",
      timeoutSegundos: 120,
    },
  });
  // Filas do menu de atendimento (novo contato WhatsApp → Comercial/Suporte/Financeiro/Ouvidoria)
  const filasMenu = [
    { nome: "Comercial", descricao: "Vendas de iPhone, maquininhas e cotação de produtos", cor: "#2563EB" },
    { nome: "Suporte", descricao: "Assistência técnica, conserto e garantia", cor: "#16A34A" },
    { nome: "Financeiro", descricao: "Boletos, pagamentos e nota fiscal", cor: "#D97706" },
  ];
  for (const f of filasMenu) {
    await prisma.attendanceQueue.upsert({
      where: { nome: f.nome },
      update: { teamId: team.id },
      create: {
        nome: f.nome,
        descricao: f.descricao,
        cor: f.cor,
        teamId: team.id,
        estrategiaAtribuicao: "round_robin",
        timeoutSegundos: 120,
      },
    });
  }
  console.log(`Filas do menu prontas: ${filasMenu.map((f) => f.nome).join(", ")}`);

  // Associa usuários ativos às filas do menu (perfil conforme nível)
  const menus = await prisma.attendanceQueue.findMany({ where: { nome: { in: filasMenu.map((f) => f.nome) } } });
  for (const u of usuarios) {
    for (const mn of menus) {
      await prisma.queueMember.upsert({
        where: { queueId_userId: { queueId: mn.id, userId: u.id } },
        update: {},
        create: {
          queueId: mn.id,
          userId: u.id,
          profile: u.nivel === "admin" ? "gestor" : u.nivel === "supervisor" ? "supervisor" : "atendente",
        },
      });
    }
  }
  console.log(`Usuários associados às filas do menu: ${usuarios.length}`);

  console.log(`Time "${team.nome}" e fila "${queue.nome}" prontos`);

  // Associa usuários ativos ao time e à fila (perfil conforme nível)
  const usuarios = await prisma.user.findMany({ where: { ativo: true } });
  for (const u of usuarios) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: u.id } },
      update: {},
      create: { teamId: team.id, userId: u.id, papel: u.nivel === "admin" ? "lider" : "membro" },
    });
    await prisma.queueMember.upsert({
      where: { queueId_userId: { queueId: queue.id, userId: u.id } },
      update: {},
      create: {
        queueId: queue.id,
        userId: u.id,
        profile: u.nivel === "admin" ? "gestor" : u.nivel === "supervisor" ? "supervisor" : "atendente",
      },
    });
  }
  console.log(`Usuários associados ao time/fila: ${usuarios.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
