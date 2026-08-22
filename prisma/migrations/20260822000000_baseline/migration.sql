-- Baseline: the complete schema as it stands.
--
-- Replaces a migration history that had drifted badly from reality. The old
-- init created 14 tables; the database had 27. Everything else -- the whole
-- retail side, Sale, SaleItem, Customer, BranchStock, InvoiceSeries, Staff --
-- existed only because someone had run `prisma db push`, which applies a schema
-- without recording how it got there.
--
-- That gap is invisible until it matters, and then it matters completely: the
-- repo could not rebuild the database. Standing up a fresh environment or
-- recovering from a serious incident would have produced a half-built schema,
-- discovered at the worst possible moment. Backups covered the data; nothing
-- covered the structure.
--
-- Squashed from the live schema and marked as already applied in production, so
-- history and reality agree again from here on. From this point migrations are
-- the only way the schema changes -- `db push` against production is what
-- created this problem and must not be how it is maintained.
--
-- The row-level security policies below are carried forward by hand. Prisma
-- does not manage policies, so a schema regenerated without them would rebuild
-- every table with no tenant isolation at all -- structurally correct and
-- completely unsafe.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('BRANCH', 'WAREHOUSE');
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PURCHASE_MANAGER', 'SALON_STAFF', 'WAREHOUSE_MANAGER', 'SUPER_ADMIN');
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FULFILLED', 'CANCELLED', 'REJECTED', 'RETURNED');
-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'VOID');
-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CARD', 'UPI');
-- CreateEnum
CREATE TYPE "BranchStockKind" AS ENUM ('RETAIL', 'SALON_USE');
-- CreateEnum
CREATE TYPE "TxnOrigin" AS ENUM ('SALON_OS', 'TALLY');
-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'QUARANTINED', 'WRITTEN_OFF');
-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "orderSeq" INTEGER NOT NULL DEFAULT 0,
    "saleSeq" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gstin" TEXT,
    "legalName" TEXT,
    "showStaffCredit" BOOLEAN NOT NULL DEFAULT true,
    "showCostToManager" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "sizeBytes" INTEGER,
    "message" TEXT,
    "commit" TEXT,
    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invoicePrefix" TEXT,
    "posHiddenCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "InvoiceSeries" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceSeries_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "locationId" TEXT,
    "label" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "barcode" TEXT,
    "binLocation" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "retailPriceCents" INTEGER NOT NULL DEFAULT 0,
    "gstRate" INTEGER NOT NULL DEFAULT 0,
    "hsn" TEXT,
    "tallyGuid" TEXT,
    "sellRetail" BOOLEAN NOT NULL DEFAULT false,
    "salonUse" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "prevQty" INTEGER NOT NULL,
    "newQty" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "refOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "BranchStock" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "BranchStockKind" NOT NULL DEFAULT 'RETAIL',
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "rackId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BranchStock_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "BranchStockMovement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "BranchStockKind" NOT NULL DEFAULT 'RETAIL',
    "userId" TEXT,
    "prevQty" INTEGER NOT NULL,
    "newQty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchStockMovement_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "invoiceNo" INTEGER NOT NULL,
    "invoiceCode" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "soldByUserId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "buyerGstin" TEXT,
    "origin" "TxnOrigin" NOT NULL DEFAULT 'SALON_OS',
    "tallyRef" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "roundOffCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "SaleReturn" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "creditNoteCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "refundMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "SaleReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "lineNetCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hsn" TEXT,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "gstRate" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "lineNetCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "staffId" TEXT,
    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "branchId" TEXT NOT NULL,
    "placedByUserId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "authCodeId" TEXT,
    "shipToAddressId" TEXT,
    "deliveryNote" TEXT,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "closureReason" TEXT,
    "closureNote" TEXT,
    "origin" "TxnOrigin" NOT NULL DEFAULT 'SALON_OS',
    "tallyRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "deliveredQty" INTEGER NOT NULL DEFAULT 0,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "outstandingReason" TEXT,
    "outstandingEta" TIMESTAMP(3),
    "outstandingRemark" TEXT,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "OrderItemDelivery" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DISPATCH',
    "dispatchedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItemDelivery_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AuthorizationCode" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "locationId" TEXT,
    "codeHash" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    CONSTRAINT "AuthorizationCode_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'reset',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TallyOutbox" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "tallyVoucherNo" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TallyOutbox_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ProductBatch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "mfgDate" TIMESTAMP(3),
    "branchId" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Org_slug_key" ON "Org"("slug");
-- CreateIndex
CREATE INDEX "BackupRun_finishedAt_idx" ON "BackupRun"("finishedAt");
-- CreateIndex
CREATE INDEX "Location_orgId_type_idx" ON "Location"("orgId", "type");
-- CreateIndex
CREATE INDEX "InvoiceSeries_orgId_idx" ON "InvoiceSeries"("orgId");
-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSeries_branchId_fy_key" ON "InvoiceSeries"("branchId", "fy");
-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
-- CreateIndex
CREATE INDEX "Address_orgId_locationId_idx" ON "Address"("orgId", "locationId");
-- CreateIndex
CREATE INDEX "Membership_orgId_role_idx" ON "Membership"("orgId", "role");
-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");
-- CreateIndex
CREATE INDEX "Product_orgId_active_category_idx" ON "Product"("orgId", "active", "category");
-- CreateIndex
CREATE UNIQUE INDEX "Product_orgId_sku_key" ON "Product"("orgId", "sku");
-- CreateIndex
CREATE UNIQUE INDEX "Product_orgId_barcode_key" ON "Product"("orgId", "barcode");
-- CreateIndex
CREATE UNIQUE INDEX "Product_orgId_tallyGuid_key" ON "Product"("orgId", "tallyGuid");
-- CreateIndex
CREATE INDEX "StockMovement_orgId_createdAt_idx" ON "StockMovement"("orgId", "createdAt");
-- CreateIndex
CREATE INDEX "StockMovement_orgId_productId_idx" ON "StockMovement"("orgId", "productId");
-- CreateIndex
CREATE INDEX "BranchStock_orgId_branchId_idx" ON "BranchStock"("orgId", "branchId");
-- CreateIndex
CREATE INDEX "BranchStock_orgId_productId_idx" ON "BranchStock"("orgId", "productId");
-- CreateIndex
CREATE UNIQUE INDEX "BranchStock_branchId_productId_kind_key" ON "BranchStock"("branchId", "productId", "kind");
-- CreateIndex
CREATE INDEX "BranchStockMovement_orgId_branchId_createdAt_idx" ON "BranchStockMovement"("orgId", "branchId", "createdAt");
-- CreateIndex
CREATE INDEX "BranchStockMovement_orgId_productId_idx" ON "BranchStockMovement"("orgId", "productId");
-- CreateIndex
CREATE INDEX "Customer_orgId_name_idx" ON "Customer"("orgId", "name");
-- CreateIndex
CREATE UNIQUE INDEX "Customer_orgId_phone_key" ON "Customer"("orgId", "phone");
-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");
-- CreateIndex
CREATE INDEX "Staff_orgId_branchId_isActive_idx" ON "Staff"("orgId", "branchId", "isActive");
-- CreateIndex
CREATE INDEX "Sale_orgId_branchId_createdAt_idx" ON "Sale"("orgId", "branchId", "createdAt");
-- CreateIndex
CREATE INDEX "Sale_orgId_status_idx" ON "Sale"("orgId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "Sale_orgId_invoiceCode_key" ON "Sale"("orgId", "invoiceCode");
-- CreateIndex
CREATE INDEX "SaleReturn_orgId_branchId_createdAt_idx" ON "SaleReturn"("orgId", "branchId", "createdAt");
-- CreateIndex
CREATE INDEX "SaleReturn_saleId_idx" ON "SaleReturn"("saleId");
-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_orgId_creditNoteCode_key" ON "SaleReturn"("orgId", "creditNoteCode");
-- CreateIndex
CREATE INDEX "SaleReturnItem_returnId_idx" ON "SaleReturnItem"("returnId");
-- CreateIndex
CREATE INDEX "SaleReturnItem_saleItemId_idx" ON "SaleReturnItem"("saleItemId");
-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");
-- CreateIndex
CREATE INDEX "Order_orgId_branchId_status_idx" ON "Order"("orgId", "branchId", "status");
-- CreateIndex
CREATE INDEX "Order_orgId_status_idx" ON "Order"("orgId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "Order_orgId_orderNo_key" ON "Order"("orgId", "orderNo");
-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
-- CreateIndex
CREATE INDEX "OrderItemDelivery_orderItemId_idx" ON "OrderItemDelivery"("orderItemId");
-- CreateIndex
CREATE INDEX "CartItem_orgId_userId_idx" ON "CartItem"("orgId", "userId");
-- CreateIndex
CREATE UNIQUE INDEX "CartItem_orgId_userId_productId_key" ON "CartItem"("orgId", "userId", "productId");
-- CreateIndex
CREATE INDEX "AuthorizationCode_orgId_isActive_idx" ON "AuthorizationCode"("orgId", "isActive");
-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
-- CreateIndex
CREATE INDEX "ApiKey_orgId_idx" ON "ApiKey"("orgId");
-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
-- CreateIndex
CREATE INDEX "AuditLogEntry_orgId_createdAt_idx" ON "AuditLogEntry"("orgId", "createdAt");
-- CreateIndex
CREATE INDEX "TallyOutbox_orgId_occurredAt_idx" ON "TallyOutbox"("orgId", "occurredAt");
-- CreateIndex
CREATE INDEX "TallyOutbox_orgId_syncedAt_idx" ON "TallyOutbox"("orgId", "syncedAt");
-- CreateIndex
CREATE UNIQUE INDEX "TallyOutbox_orgId_externalRef_key" ON "TallyOutbox"("orgId", "externalRef");
-- CreateIndex
CREATE INDEX "ProductBatch_orgId_status_expiryDate_idx" ON "ProductBatch"("orgId", "status", "expiryDate");
-- CreateIndex
CREATE INDEX "ProductBatch_orgId_branchId_status_idx" ON "ProductBatch"("orgId", "branchId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "ProductBatch_orgId_productId_batchNo_branchId_key" ON "ProductBatch"("orgId", "productId", "batchNo", "branchId");
-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InvoiceSeries" ADD CONSTRAINT "InvoiceSeries_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InvoiceSeries" ADD CONSTRAINT "InvoiceSeries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BranchStockMovement" ADD CONSTRAINT "BranchStockMovement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BranchStockMovement" ADD CONSTRAINT "BranchStockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BranchStockMovement" ADD CONSTRAINT "BranchStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_authCodeId_fkey" FOREIGN KEY ("authCodeId") REFERENCES "AuthorizationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipToAddressId_fkey" FOREIGN KEY ("shipToAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderItemDelivery" ADD CONSTRAINT "OrderItemDelivery_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuthorizationCode" ADD CONSTRAINT "AuthorizationCode_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TallyOutbox" ADD CONSTRAINT "TallyOutbox_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TallyOutbox" ADD CONSTRAINT "TallyOutbox_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ————————————————————————————————————————————————————————
-- Row-level security
-- ————————————————————————————————————————————————————————

ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuthorizationCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthorizationCode" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditLogEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLogEntry" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Address" FORCE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "OrderItemDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItemDelivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Location"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "Product"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "StockMovement"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "Order"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "CartItem"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "AuthorizationCode"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "AuditLogEntry"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "Address"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "OrderItem"
  USING (EXISTS (
    SELECT 1 FROM "Order" o
    WHERE o.id = "OrderItem"."orderId"
      AND o."orgId" = current_setting('app.org_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Order" o
    WHERE o.id = "OrderItem"."orderId"
      AND o."orgId" = current_setting('app.org_id', true)
  ));
CREATE POLICY org_isolation ON "OrderItemDelivery"
  USING (EXISTS (
    SELECT 1 FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE oi.id = "OrderItemDelivery"."orderItemId"
      AND o."orgId" = current_setting('app.org_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE oi.id = "OrderItemDelivery"."orderItemId"
      AND o."orgId" = current_setting('app.org_id', true)
  ));
ALTER TABLE "BranchStock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchStock" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BranchStockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchStockMovement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SaleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "BranchStock"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "BranchStockMovement"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "Sale"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "SaleItem"
  USING (EXISTS (
    SELECT 1 FROM "Sale" s
    WHERE s.id = "SaleItem"."saleId"
      AND s."orgId" = current_setting('app.org_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Sale" s
    WHERE s.id = "SaleItem"."saleId"
      AND s."orgId" = current_setting('app.org_id', true)
  ));
ALTER TABLE "InvoiceSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceSeries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturn" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturnItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "InvoiceSeries"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "SaleReturn"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
CREATE POLICY org_isolation ON "SaleReturnItem"
  USING (EXISTS (
    SELECT 1 FROM "SaleReturn" sr
    WHERE sr.id = "SaleReturnItem"."returnId"
      AND sr."orgId" = current_setting('app.org_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "SaleReturn" sr
    WHERE sr.id = "SaleReturnItem"."returnId"
      AND sr."orgId" = current_setting('app.org_id', true)
  ));
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Customer"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Staff"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
ALTER TABLE "TallyOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallyOutbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "TallyOutbox"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
ALTER TABLE "ProductBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "ProductBatch"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
