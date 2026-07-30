-- CreateTable: bóveda de credenciales de portales por cliente (contable).
-- La contraseña se guarda cifrada en "claveEnc" (AES-256-GCM, ver utils/crypto.ts).
CREATE TABLE "client_credentials" (
    "id" TEXT NOT NULL,
    "taxClientId" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "usuario1" TEXT NOT NULL,
    "usuario2" TEXT,
    "claveEnc" TEXT NOT NULL,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_credentials_taxClientId_idx" ON "client_credentials"("taxClientId");

-- AddForeignKey
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_taxClientId_fkey" FOREIGN KEY ("taxClientId") REFERENCES "tax_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
