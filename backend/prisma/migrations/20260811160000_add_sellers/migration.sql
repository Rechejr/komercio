-- Portal de vendedoras: tabla de vendedores + atribución de la cuenta creada.

CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sellers_email_key" ON "sellers"("email");
CREATE UNIQUE INDEX "sellers_slug_key" ON "sellers"("slug");

ALTER TABLE "businesses" ADD COLUMN "createdBySellerId" TEXT;
CREATE INDEX "businesses_createdBySellerId_idx" ON "businesses"("createdBySellerId");
