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
      { canal: "facebook", ativo: false },
      { canal: "instagram", ativo: false },
      { canal: "tiktok", ativo: false },
    ],
    skipDuplicates: true,
  });
  console.log("Channels criados");
}

main().catch(console.error).finally(() => prisma.$disconnect());
