-- Row-Level Security for the retail side (branch inventory + customer billing).
-- Same fail-closed pattern as 20260719000001_rls: ENABLE + FORCE, and every
-- predicate compares the row's org to `app.org_id`, which the app sets per
-- transaction. When the setting is missing, no rows pass.
--
-- SaleItem has no orgId of its own, so it is scoped through its parent Sale —
-- exactly how OrderItem is scoped through Order.

ALTER TABLE "BranchStock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchStock" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "BranchStock"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "BranchStockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchStockMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "BranchStockMovement"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Sale"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "SaleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleItem" FORCE ROW LEVEL SECURITY;
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
