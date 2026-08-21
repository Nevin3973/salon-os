import { Prisma } from "@prisma/client";
import { withOrg } from "@/lib/tenant";

/// Stock Item Summary — opening, movement and closing per product.
///
/// Derived from the movement ledgers rather than from a stored balance. Both
/// ledgers are append-only and record prevQty and newQty on every row, so any
/// period can be reconstructed exactly, and a figure that looks wrong can
/// always be traced to the movements that produced it. A stored running total
/// cannot be audited that way — it can only be believed.
///
/// This is the report the client asked for in section 7 of the requirements,
/// and it is also how the negative-stock problem in their existing Tally data
/// would be spotted early: an outward movement with no inward to support it
/// shows up here as a closing balance that cannot be explained.

export type StockSummaryRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  /// Balance at the start of the period.
  opening: number;
  /// Received from the warehouse.
  inward: number;
  /// Sold to walk-in clients.
  outward: number;
  /// Consumed during services (back bar).
  salonUse: number;
  /// Came back from clients — returns and voided bills.
  returns: number;
  /// Sent back to the warehouse.
  toWarehouse: number;
  /// Stock-count corrections and manual changes.
  adjustments: number;
  /// opening + everything above. Reconciles by construction.
  closing: number;
};

type DeltaRow = { productId: string; kind: string; cat: string; delta: bigint | number };
type OpenRow = { productId: string; kind: string; bal: bigint | number };

const n = (v: bigint | number | null) => (v === null ? 0 : typeof v === "bigint" ? Number(v) : v);

/// Movement reasons carry an optional " · detail" suffix, so categories are
/// matched on the part before it.
function bucket(row: StockSummaryRow, cat: string, kind: string, delta: number) {
  if (kind === "SALON_USE") {
    // Back-bar movement. Consumption is negative; a top-up from the shelf is
    // an internal transfer and is counted as inward to the back bar.
    if (delta < 0) row.salonUse += -delta;
    else row.inward += delta;
    return;
  }
  switch (cat) {
    case "Opening stock":
    case "Delivery":
      row.inward += delta;
      break;
    case "Sale":
      row.outward += -delta;
      break;
    case "Customer return":
    case "Void sale":
      row.returns += delta;
      break;
    case "Return to warehouse":
      row.toWarehouse += -delta;
      break;
    default:
      row.adjustments += delta;
  }
}

/// Per-product summary for one branch over [from, to).
/// Runs inside withOrg rather than taking a caller's client.
///
/// These are raw statements, and every table they touch is behind FORCE row
/// level security keyed on `app.org_id`. That setting is established by
/// withOrg's transaction — the scoped client from requireScopedSession applies
/// its filtering in the query builder and never sets it, so raw SQL issued
/// through that client matches no rows at all. It returns an empty report
/// rather than an error, which is the kind of failure that reaches production
/// looking like a quiet week of trading.
export async function branchStockSummary(
  orgId: string,
  branchId: string,
  from: Date,
  to: Date,
): Promise<StockSummaryRow[]> {
  return withOrg(orgId, async (db) => {
    const deltas = (await db.$queryRaw(Prisma.sql`
      SELECT m."productId",
             m.kind::text AS kind,
             split_part(m.reason, ' · ', 1) AS cat,
             SUM(m."newQty" - m."prevQty") AS delta
        FROM "BranchStockMovement" m
       WHERE m."branchId" = ${branchId}
         AND m."createdAt" >= ${from}
         AND m."createdAt" <  ${to}
       GROUP BY 1, 2, 3
    `)) as DeltaRow[];

    // Opening balance is the prevQty of the first movement inside the period;
    // where a product did not move at all, it is the newQty of the last movement
    // before it. A product with no history either way opens at zero.
    const openings = (await db.$queryRaw(Prisma.sql`
      WITH first_in AS (
        SELECT DISTINCT ON (m."productId", m.kind)
               m."productId", m.kind::text AS kind, m."prevQty" AS bal
          FROM "BranchStockMovement" m
         WHERE m."branchId" = ${branchId}
           AND m."createdAt" >= ${from}
           AND m."createdAt" <  ${to}
         ORDER BY m."productId", m.kind, m."createdAt" ASC, m.id ASC
      ),
      last_before AS (
        SELECT DISTINCT ON (m."productId", m.kind)
               m."productId", m.kind::text AS kind, m."newQty" AS bal
          FROM "BranchStockMovement" m
         WHERE m."branchId" = ${branchId}
           AND m."createdAt" < ${from}
         ORDER BY m."productId", m.kind, m."createdAt" DESC, m.id DESC
      )
      SELECT COALESCE(f."productId", l."productId") AS "productId",
             COALESCE(f.kind, l.kind)              AS kind,
             COALESCE(f.bal,  l.bal)               AS bal
        FROM first_in f
        FULL OUTER JOIN last_before l
          ON l."productId" = f."productId" AND l.kind = f.kind
    `)) as OpenRow[];

    const ids = new Set<string>();
    for (const d of deltas) ids.add(d.productId);
    for (const o of openings) ids.add(o.productId);
    if (!ids.size) return [];

    const products = (await db.$queryRaw(Prisma.sql`
      SELECT id, sku, name, unit, category
        FROM "Product"
       WHERE id IN (${Prisma.join([...ids])})
    `)) as Array<{ id: string; sku: string; name: string; unit: string; category: string }>;

    const rows = new Map<string, StockSummaryRow>();
    for (const p of products) {
      rows.set(p.id, {
        productId: p.id, sku: p.sku, name: p.name, unit: p.unit, category: p.category,
        opening: 0, inward: 0, outward: 0, salonUse: 0,
        returns: 0, toWarehouse: 0, adjustments: 0, closing: 0,
      });
    }

    for (const o of openings) {
      const row = rows.get(o.productId);
      if (row) row.opening += n(o.bal);
    }
    for (const d of deltas) {
      const row = rows.get(d.productId);
      if (row) bucket(row, d.cat, d.kind, n(d.delta));
    }

    for (const row of rows.values()) {
      row.closing =
        row.opening + row.inward - row.outward - row.salonUse + row.returns
        - row.toWarehouse + row.adjustments;
    }

    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
}

export type WarehouseSummaryRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  opening: number;
  /// Came back from a salon, including expired lots sent back.
  receivedBack: number;
  /// Went out to salons.
  dispatched: number;
  /// Disposed of — expired, damaged, recalled.
  writtenOff: number;
  /// Stock counts, imports and manual corrections.
  adjustments: number;
  closing: number;
};

/// Warehouse movement categories, matched on the part of `action` before the
/// " · " detail suffix.
///
/// "Import" is deliberately an ADJUSTMENT, not inward. The warehouse import
/// replaces a product's count rather than receiving against an invoice, so
/// reporting it as purchases would overstate goods received — sometimes
/// wildly, since a correction downwards would land as negative inward. True
/// purchases will populate this report once the Tally inbound sync carries
/// them across; until then the warehouse has no goods-receipt path at all.
function warehouseBucket(row: WarehouseSummaryRow, cat: string, delta: number) {
  switch (cat) {
    case "Dispatch":
      row.dispatched += -delta;
      break;
    case "Return":
    case "Expired return":
      row.receivedBack += delta;
      break;
    case "Write-off":
      row.writtenOff += -delta;
      break;
    default:
      row.adjustments += delta;
  }
}

/// Per-product summary for the central warehouse over [from, to).
///
/// Same derivation as the branch report and the same reason for it: the ledger
/// is append-only and carries prevQty and newQty on every row, so a period can
/// be reconstructed exactly and any figure traced to the movements behind it.
export async function warehouseStockSummary(
  orgId: string,
  from: Date,
  to: Date,
): Promise<WarehouseSummaryRow[]> {
  return withOrg(orgId, async (db) => {
    const deltas = (await db.$queryRaw(Prisma.sql`
      SELECT m."productId",
             split_part(m.action, ' · ', 1) AS cat,
             SUM(m."newQty" - m."prevQty") AS delta
        FROM "StockMovement" m
       WHERE m."createdAt" >= ${from}
         AND m."createdAt" <  ${to}
       GROUP BY 1, 2
    `)) as Array<{ productId: string; cat: string; delta: bigint | number }>;

    const openings = (await db.$queryRaw(Prisma.sql`
      WITH first_in AS (
        SELECT DISTINCT ON (m."productId") m."productId", m."prevQty" AS bal
          FROM "StockMovement" m
         WHERE m."createdAt" >= ${from} AND m."createdAt" < ${to}
         ORDER BY m."productId", m."createdAt" ASC, m.id ASC
      ),
      last_before AS (
        SELECT DISTINCT ON (m."productId") m."productId", m."newQty" AS bal
          FROM "StockMovement" m
         WHERE m."createdAt" < ${from}
         ORDER BY m."productId", m."createdAt" DESC, m.id DESC
      )
      SELECT COALESCE(f."productId", l."productId") AS "productId",
             COALESCE(f.bal, l.bal)                AS bal
        FROM first_in f
        FULL OUTER JOIN last_before l ON l."productId" = f."productId"
    `)) as Array<{ productId: string; bal: bigint | number }>;

    const ids = new Set<string>();
    for (const d of deltas) ids.add(d.productId);
    for (const o of openings) ids.add(o.productId);
    if (!ids.size) return [];

    const products = (await db.$queryRaw(Prisma.sql`
      SELECT id, sku, name, unit, category
        FROM "Product"
       WHERE id IN (${Prisma.join([...ids])})
    `)) as Array<{ id: string; sku: string; name: string; unit: string; category: string }>;

    const rows = new Map<string, WarehouseSummaryRow>();
    for (const p of products) {
      rows.set(p.id, {
        productId: p.id, sku: p.sku, name: p.name, unit: p.unit, category: p.category,
        opening: 0, receivedBack: 0, dispatched: 0, writtenOff: 0, adjustments: 0, closing: 0,
      });
    }

    for (const o of openings) {
      const row = rows.get(o.productId);
      if (row) row.opening += n(o.bal);
    }
    for (const d of deltas) {
      const row = rows.get(d.productId);
      if (row) warehouseBucket(row, d.cat, n(d.delta));
    }

    for (const row of rows.values()) {
      row.closing =
        row.opening + row.receivedBack - row.dispatched - row.writtenOff + row.adjustments;
    }

    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
}
