-- CreateTable
CREATE TABLE "TransferInvoice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "roundOffCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "TransferInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hsn" TEXT,
    "unit" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "gstRate" INTEGER NOT NULL,
    "taxableCents" INTEGER NOT NULL,
    "cgstCents" INTEGER NOT NULL,
    "sgstCents" INTEGER NOT NULL,

CONSTRAINT "TransferInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferInvoice_orgId_branchId_idx" ON "TransferInvoice"("orgId", "branchId");

-- CreateIndex
CREATE INDEX "TransferInvoice_orderId_idx" ON "TransferInvoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferInvoice_orgId_invoiceNo_key" ON "TransferInvoice"("orgId", "invoiceNo");

-- CreateIndex
CREATE INDEX "TransferInvoiceItem_invoiceId_idx" ON "TransferInvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "TransferInvoiceItem_productId_idx" ON "TransferInvoiceItem"("productId");

-- AddForeignKey
ALTER TABLE "TransferInvoice" ADD CONSTRAINT "TransferInvoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferInvoice" ADD CONSTRAINT "TransferInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferInvoice" ADD CONSTRAINT "TransferInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferInvoiceItem" ADD CONSTRAINT "TransferInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TransferInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferInvoiceItem" ADD CONSTRAINT "TransferInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ————————————————————————————————————————————————————————
-- Row-level security
--
-- The app connects as a non-superuser with NOBYPASSRLS, so a tenant table
-- without a policy here is readable across every org in the database. The
-- child table has no orgId of its own and is gated through its parent, the
-- same way SaleItem and OrderItem are.
--
-- No GRANT here on purpose: provision-app-role.sql sets ALTER DEFAULT
-- PRIVILEGES, so tables created by the migration owner are granted
-- automatically. A literal GRANT would instead fail the migration anywhere the
-- role does not exist, which is exactly how CI builds its database.
-- ————————————————————————————————————————————————————————
ALTER TABLE "TransferInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransferInvoice" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TransferInvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransferInvoiceItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON "TransferInvoice"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

CREATE POLICY org_isolation ON "TransferInvoiceItem"
  USING (EXISTS (
    SELECT 1 FROM "TransferInvoice" ti
    WHERE ti.id = "TransferInvoiceItem"."invoiceId"
      AND ti."orgId" = current_setting('app.org_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "TransferInvoice" ti
    WHERE ti.id = "TransferInvoiceItem"."invoiceId"
      AND ti."orgId" = current_setting('app.org_id', true)
  ));
