-- Row-Level Security for the retail-parity tables: the per-branch invoice
-- series and the credit notes raised when customers return goods.
--
-- Same fail-closed pattern as the earlier RLS migrations: ENABLE + FORCE, and
-- every predicate compares the row's org to `app.org_id`, which the app sets
-- per transaction. When the setting is missing, no rows pass.
--
-- SaleReturnItem has no orgId of its own, so it is scoped through its parent
-- SaleReturn — exactly how SaleItem is scoped through Sale.

ALTER TABLE "InvoiceSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceSeries" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "InvoiceSeries"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "SaleReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturn" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "SaleReturn"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "SaleReturnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturnItem" FORCE ROW LEVEL SECURITY;
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
