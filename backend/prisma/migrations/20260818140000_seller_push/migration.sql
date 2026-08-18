-- Suscripciones push del portal de vendedoras. Aparte de push_subscriptions
-- porque las vendedoras no son usuarios del sistema: tienen su propia tabla y
-- su propia sesión.
CREATE TABLE "seller_push_subscriptions" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_push_subscriptions_endpoint_key" ON "seller_push_subscriptions"("endpoint");
CREATE INDEX "seller_push_subscriptions_sellerId_idx" ON "seller_push_subscriptions"("sellerId");

ALTER TABLE "seller_push_subscriptions" ADD CONSTRAINT "seller_push_subscriptions_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
