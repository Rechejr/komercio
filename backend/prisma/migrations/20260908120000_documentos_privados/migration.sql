-- Los documentos de la bóveda pasan a ser privados en Cloudinary. Se guarda el
-- identificador del archivo para poder firmarlo y borrarlo sin depender de
-- adivinarlo desde la URL.
ALTER TABLE "client_documents" ADD COLUMN "publicId" TEXT;
ALTER TABLE "client_documents" ADD COLUMN "resourceType" TEXT;
