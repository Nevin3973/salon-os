-- Row-level security for the Tally outbound queue.
--
-- Same fail-closed pattern as every other tenant table: ENABLE + FORCE, with
-- the predicate comparing the row's org to `app.org_id`, which the app sets
-- per transaction. When the setting is missing, no rows pass.
--
-- This table matters more than most. Each row carries a full snapshot of a
-- bill -- customer name, GSTIN, line items, amounts -- and it is read by an
-- API key rather than a logged-in user, so a missing policy would hand one
-- group's entire sales ledger to another group's connector. Writes need the
-- same protection: a row planted under another org's id would be collected by
-- their connector and imported into their books as a genuine voucher.

ALTER TABLE "TallyOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallyOutbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "TallyOutbox"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));
