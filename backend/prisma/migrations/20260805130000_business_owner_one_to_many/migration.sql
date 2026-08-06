-- Un usuario puede ser dueño de varios negocios (POS + Contable con un mismo
-- login). Se reemplaza el índice ÚNICO de ownerId por uno normal.
DROP INDEX "businesses_ownerId_key";
CREATE INDEX "businesses_ownerId_idx" ON "businesses"("ownerId");
