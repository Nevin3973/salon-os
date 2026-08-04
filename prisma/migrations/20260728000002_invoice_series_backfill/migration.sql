-- Moves invoices from one org-wide counter ("INV-0042") to a per-branch,
-- per-financial-year series ("ROS/25-26/0042"), WITHOUT losing existing bills.
--
-- Adding `invoiceCode`/`fy` as required columns would fail on any database that
-- already has sales, so each is added nullable, backfilled from what the row
-- already knows, and only then made NOT NULL. Existing numbers keep their
-- sequence, so no invoice ever changes its identity in a customer's records.

-- 1. New columns, nullable to begin with.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "invoiceCode" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "fy" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "buyerGstin" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "roundOffCents" INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill the financial year from the sale date. India's FY starts 1 April,
--    so anything in Jan–Mar belongs to the year that began the previous April.
UPDATE "Sale" SET "fy" = CASE
  WHEN EXTRACT(MONTH FROM "createdAt") >= 4 THEN
    lpad((EXTRACT(YEAR FROM "createdAt")::int % 100)::text, 2, '0') || '-' ||
    lpad(((EXTRACT(YEAR FROM "createdAt")::int + 1) % 100)::text, 2, '0')
  ELSE
    lpad(((EXTRACT(YEAR FROM "createdAt")::int - 1) % 100)::text, 2, '0') || '-' ||
    lpad((EXTRACT(YEAR FROM "createdAt")::int % 100)::text, 2, '0')
END
WHERE "fy" IS NULL;

-- 3. Give each branch an invoice prefix (first three letters of its name).
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "invoicePrefix" TEXT;
UPDATE "Location"
SET "invoicePrefix" = COALESCE(
  NULLIF(upper(substring(regexp_replace(name, '[^A-Za-z]', '', 'g') from 1 for 3)), ''),
  'BR'
)
WHERE "invoicePrefix" IS NULL AND type = 'BRANCH';

-- 4. Build the printed code from the branch prefix, the FY and the existing
--    number. The old numbers were unique per org, so these are too.
UPDATE "Sale" s
SET "invoiceCode" = COALESCE(l."invoicePrefix", 'BR') || '/' || s."fy" || '/' || lpad(s."invoiceNo"::text, 4, '0')
FROM "Location" l
WHERE l.id = s."branchId" AND s."invoiceCode" IS NULL;

-- Any sale whose branch vanished still needs a code.
UPDATE "Sale" SET "invoiceCode" = 'BR/' || "fy" || '/' || lpad("invoiceNo"::text, 4, '0')
WHERE "invoiceCode" IS NULL;

-- 5. Now they can be required.
ALTER TABLE "Sale" ALTER COLUMN "invoiceCode" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "fy" SET NOT NULL;

-- 6. Uniqueness moves from the old org-wide number to the printed code.
DROP INDEX IF EXISTS "Sale_orgId_invoiceNo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_orgId_invoiceCode_key" ON "Sale"("orgId", "invoiceCode");

-- 7. Line-level discount and return tracking.
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "returnedQty" INTEGER NOT NULL DEFAULT 0;

-- 8. Scannable barcode and warehouse bin.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "binLocation" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_orgId_barcode_key" ON "Product"("orgId", "barcode");

-- 9. Seed the live counters from the highest number each branch has used, so
--    the next real sale continues the series instead of colliding with it.
CREATE TABLE IF NOT EXISTS "InvoiceSeries" (
  "id"       TEXT NOT NULL,
  "orgId"    TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "fy"       TEXT NOT NULL,
  "prefix"   TEXT NOT NULL,
  "seq"      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceSeries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSeries_branchId_fy_key" ON "InvoiceSeries"("branchId", "fy");
CREATE INDEX IF NOT EXISTS "InvoiceSeries_orgId_idx" ON "InvoiceSeries"("orgId");

INSERT INTO "InvoiceSeries" ("id", "orgId", "branchId", "fy", "prefix", "seq")
SELECT
  md5(s."branchId" || ':' || s."fy"),
  s."orgId",
  s."branchId",
  s."fy",
  COALESCE(l."invoicePrefix", 'BR'),
  MAX(s."invoiceNo")
FROM "Sale" s
JOIN "Location" l ON l.id = s."branchId"
GROUP BY s."branchId", s."fy", s."orgId", l."invoicePrefix"
ON CONFLICT ("branchId", "fy") DO NOTHING;
