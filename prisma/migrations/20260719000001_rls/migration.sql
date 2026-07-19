-- Row-Level Security: the database-side tenant wall.
--
-- The app sets `app.org_id` on every transaction that touches tenant data
-- (see src/lib/tenant.ts `withOrg`). These policies make Postgres itself
-- refuse to return or accept rows from any other org — even if application
-- code has a bug. When the setting is missing, `current_setting(..., true)`
-- yields NULL, every predicate is unknown, and NO rows pass: fail closed.
--
-- FORCE is required because the app connects as the table owner, and owners
-- bypass plain RLS.
--
-- Deliberately exempt (needed before an org context exists):
--   "User"       — global identity, no orgId
--   "Membership" — read at login to list a user's orgs
--   "Org"        — read at login for the org picker
--   "ApiKey"     — looked up by key prefix to discover the org

-- Tables with a direct orgId column
ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Location"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Product"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "StockMovement"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Order"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "CartItem"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "AuthorizationCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthorizationCode" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "AuthorizationCode"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "AuditLogEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLogEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "AuditLogEntry"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Address" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Address"
  USING ("orgId" = current_setting('app.org_id', true))
  WITH CHECK ("orgId" = current_setting('app.org_id', true));

-- Child tables scoped through their parent Order
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;
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

ALTER TABLE "OrderItemDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItemDelivery" FORCE ROW LEVEL SECURITY;
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
