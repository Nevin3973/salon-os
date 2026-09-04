-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "mrpTotalCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "mrpCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AuthorizationCode" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "AuthorizationCode_userId_idx" ON "AuthorizationCode"("userId");

-- AddForeignKey
ALTER TABLE "AuthorizationCode" ADD CONSTRAINT "AuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

