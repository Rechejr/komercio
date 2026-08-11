-- Pago en el catálogo público: link de pago y/o imagen de QR.
ALTER TABLE "businesses" ADD COLUMN "catalogPaymentLink" TEXT;
ALTER TABLE "businesses" ADD COLUMN "catalogPaymentQr" TEXT;
