-- CreateTable
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "modelo" TEXT,
    "armazenamento" TEXT,
    "valor" DECIMAL(10,2),
    "seminovo" BOOLEAN NOT NULL DEFAULT false,
    "registrado_por" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
