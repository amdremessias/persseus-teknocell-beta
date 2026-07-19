CREATE TABLE "config_taxas_maquininha" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "taxas" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_taxas_maquininha_pkey" PRIMARY KEY ("id")
);
