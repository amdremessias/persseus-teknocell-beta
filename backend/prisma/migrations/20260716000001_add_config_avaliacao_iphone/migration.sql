CREATE TABLE "config_avaliacao_iphone" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tabela" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_avaliacao_iphone_pkey" PRIMARY KEY ("id")
);
