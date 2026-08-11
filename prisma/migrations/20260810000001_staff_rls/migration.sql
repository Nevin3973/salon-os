-- Row-level security for the staff roster.
--
-- Same fail-closed pattern as every other tenant table: ENABLE + FORCE, with
-- the predicate comparing the row's org to `app.org_id`, which the app sets per
-- transaction. When the setting is missing, no rows pass.
--
-- Staff holds people's names and which salon they work at, so a missing policy
-- would leak one group's roster to another. It is also the table commission is
-- computed from, which makes it worth protecting from writes as much as reads:
-- a row planted under another org's id would quietly attribute someone else's
-- revenue.

ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Staff"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

-- SaleItem.staffId needs no policy of its own: SaleItem is already scoped
-- through its parent Sale, exactly as the other line tables are.
