-- Temporarily turn OFF row-level security on every tenant table.
-- Used ONLY around a full reseed run as the database owner: the owner role on
-- Neon is subject to FORCE RLS, so with policies active it cannot clear or
-- repopulate these tables. Policies are NOT dropped — only enforcement pauses.
-- Always follow a reseed with scripts/rls-enable.sql to restore the wall.
ALTER TABLE "Location" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthorizationCode" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLogEntry" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Address" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItemDelivery" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchStock" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchStockMovement" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleItem" DISABLE ROW LEVEL SECURITY;
