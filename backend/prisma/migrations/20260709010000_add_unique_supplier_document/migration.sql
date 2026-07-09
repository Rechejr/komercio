-- Normalize empty-string documents to NULL first — multiple NULLs are allowed
-- under a unique index, so suppliers without a document stay unaffected.
UPDATE "suppliers" SET document = NULL WHERE document = '';

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_businessId_document_key" ON "suppliers"("businessId", "document");
