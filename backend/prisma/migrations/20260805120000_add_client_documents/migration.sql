-- Bóveda de documentos por cliente del contador (Cascada al borrar el cliente).
-- CreateTable
CREATE TABLE "client_documents" (
    "id" TEXT NOT NULL,
    "taxClientId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_documents_taxClientId_idx" ON "client_documents"("taxClientId");

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_taxClientId_fkey" FOREIGN KEY ("taxClientId") REFERENCES "tax_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
