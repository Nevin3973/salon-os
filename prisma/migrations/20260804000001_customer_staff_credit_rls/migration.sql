-- Row-Level Security for the customer master.
--
-- Same fail-closed pattern as the earlier RLS migrations: ENABLE + FORCE, and
-- the predicate compares the row's org to `app.org_id`, which the app sets per
-- transaction. When the setting is missing, no rows pass.
--
-- This one matters more than most: Customer holds names and phone numbers, so
-- a missing policy would leak one salon group's customer list to another. A new
-- tenant table without a policy is the easiest security hole to open by
-- accident, because nothing fails — the queries just quietly return everything.

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Customer"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

-- Sale.customerId / Sale.isWalkIn and SaleItem.staffUserId need no policy of
-- their own: Sale is already scoped by org, and SaleItem inherits through its
-- parent Sale, exactly as the other line tables do.
