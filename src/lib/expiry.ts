import type { BatchStatus } from "@prisma/client";

/// Expiry reporting over the batch register.
///
/// "Expired" and "short-dated" are separate questions. Expired stock is a
/// write-off that has already happened and just has not been booked yet.
/// Short-dated stock is still sellable and still worth money — it is the half a
/// manager can act on, by pushing it, moving it to a busier branch, or sending
/// it back while the warehouse can still redistribute it. A report that folds
/// the two together buries the actionable half under the lost half.

/// How far ahead counts as short-dated. Ninety days is the usual salon-trade
/// window: long enough to move stock between branches, short enough that the
/// list stays worth reading.
export const SHORT_DATED_DAYS = 90;

export type BatchRow = {
  id: string;
  batchNo: string;
  expiryDate: Date;
  qty: number;
  status: BatchStatus;
  reason: string | null;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  /// Null means the central warehouse.
  branchId: string | null;
  branchName: string | null;
  /// Negative once expired.
  daysLeft: number;
};

export type ExpiryBuckets = {
  expired: BatchRow[];
  shortDated: BatchRow[];
  quarantined: BatchRow[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/// Whole days from today to `expiry`, in IST terms — a batch expiring later
/// today is 0, not -1.
export function daysUntil(expiry: Date, now = new Date()): number {
  const a = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / DAY_MS);
}

type BatchQueryDb = {
  productBatch: {
    findMany: (args: {
      where: Record<string, unknown>;
      include: { product: { select: Record<string, boolean> } ; branch: { select: Record<string, boolean> } };
      orderBy: Array<Record<string, string>>;
    }) => Promise<Array<Record<string, never>>>;
  };
};

/// Batches worth a manager's attention at one location, or across all of them.
///
/// `branchId` undefined means every location; null means the central warehouse
/// specifically. The distinction matters — the warehouse is represented by the
/// absence of a branch, so "all" and "warehouse" cannot share a value.
export async function expiryBuckets(
  db: unknown,
  opts: { branchId?: string | null; withinDays?: number } = {},
): Promise<ExpiryBuckets> {
  const within = opts.withinDays ?? SHORT_DATED_DAYS;
  const now = new Date();
  const horizon = new Date(now.getTime() + within * DAY_MS);

  const rows = await (db as BatchQueryDb).productBatch.findMany({
    where: {
      qty: { gt: 0 },
      status: { not: "WRITTEN_OFF" },
      ...(opts.branchId === undefined ? {} : { branchId: opts.branchId }),
      OR: [{ expiryDate: { lte: horizon } }, { status: "QUARANTINED" }],
    },
    include: {
      product: { select: { name: true, sku: true, unit: true } },
      branch: { select: { name: true } },
    },
    orderBy: [{ expiryDate: "asc" }],
  });

  const mapped: BatchRow[] = (rows as unknown as Array<{
    id: string; batchNo: string; expiryDate: Date; qty: number; status: BatchStatus;
    reason: string | null; productId: string; branchId: string | null;
    product: { name: string; sku: string; unit: string };
    branch: { name: string } | null;
  }>).map((b) => ({
    id: b.id,
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    qty: b.qty,
    status: b.status,
    reason: b.reason,
    productId: b.productId,
    productName: b.product.name,
    sku: b.product.sku,
    unit: b.product.unit,
    branchId: b.branchId,
    branchName: b.branch?.name ?? null,
    daysLeft: daysUntil(b.expiryDate, now),
  }));

  return {
    // Quarantined stock is listed on its own whatever its date: it has already
    // been pulled from sale, so repeating it under expired or short-dated would
    // double-count the same units in the manager's view.
    quarantined: mapped.filter((b) => b.status === "QUARANTINED"),
    expired: mapped.filter((b) => b.status === "ACTIVE" && b.daysLeft < 0),
    shortDated: mapped.filter((b) => b.status === "ACTIVE" && b.daysLeft >= 0),
  };
}
