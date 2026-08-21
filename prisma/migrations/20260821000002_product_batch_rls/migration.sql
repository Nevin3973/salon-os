-- Row-level security for the batch register.
--
-- Same fail-closed pattern as every other tenant table: ENABLE + FORCE, with
-- the predicate comparing the row's org to `app.org_id`, which the app sets per
-- transaction. When the setting is missing, no rows pass.
--
-- Batches drive the expiry reports and the write-off flow, so a missing policy
-- would show one group's expiring stock to another and, worse, let a write-off
-- be booked against a lot belonging to someone else's salon.

ALTER TABLE "ProductBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "ProductBatch"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
