import type { Prisma } from "@prisma/client";
import { withOrg } from "@/lib/tenant";

/**
 * Reserved quantity per product for an org = sum of (requestedQty - deliveredQty)
 * across all OrderItems whose parent Order is still PENDING or PROCESSING.
 * Derived live (not a maintained counter) — see the plan's rationale.
 *
 * Pass the transaction client when calling from inside a locked transaction
 * (which must already carry the RLS org context) for a consistent read;
 * otherwise a fresh org-scoped transaction is opened.
 */
export async function reservedByProduct(
  orgId: string,
  client?: Prisma.TransactionClient
): Promise<Map<string, number>> {
  const query = (tx: Prisma.TransactionClient) =>
    tx.orderItem.findMany({
      where: {
        order: { orgId, status: { in: ["PENDING", "PROCESSING"] } },
      },
      select: { productId: true, requestedQty: true, deliveredQty: true },
    });

  const rows = client ? await query(client) : await withOrg(orgId, query);

  const map = new Map<string, number>();
  for (const r of rows) {
    const outstanding = r.requestedQty - r.deliveredQty;
    if (outstanding <= 0) continue;
    map.set(r.productId, (map.get(r.productId) ?? 0) + outstanding);
  }
  return map;
}

/** available = max(0, stock - reserved) */
export function availableOf(stock: number, reserved: number): number {
  return Math.max(0, stock - reserved);
}

export type StockState = "in" | "low" | "out";

export function stockState(available: number, minStock: number): StockState {
  if (available <= 0) return "out";
  if (available < minStock) return "low";
  return "in";
}
