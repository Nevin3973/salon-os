import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

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
export async function branchStockSummary(
  db: PrismaClient,
  branchId: string,
  from: Date,
  to: Date,
): Promise<StockSummaryRow[]> {
  const deltas = await db.$queryRaw<DeltaRow[]>(Prisma.sql`
    SELECT m."productId",
           m.kind::text AS kind,
           split_part(m.reason, ' · ', 1) AS cat,
           SUM(m."newQty" - m."prevQty") AS delta
      FROM "BranchStockMovement" m
     WHERE m."branchId" = ${branchId}
       AND m."createdAt" >= ${from}
       AND m."createdAt" <  ${to}
     GROUP BY 1, 2, 3
  `);

  // Opening balance is the prevQty of the first movement inside the period;
  // where a product did not move at all, it is the newQty of the last movement
  // before it. A product with no history either way opens at zero.
  const openings = await db.$queryRaw<OpenRow[]>(Prisma.sql`
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
  `);

  const ids = new Set<string>();
  for (const d of deltas) ids.add(d.productId);
  for (const o of openings) ids.add(o.productId);
  if (!ids.size) return [];

  const products = await db.product.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, sku: true, name: true, unit: true, category: true },
  });

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
}
