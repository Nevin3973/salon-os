import { Prisma } from "@prisma/client";

/**
 * Moves a branch's on-hand stock for one product and records the movement, all
 * inside a caller-supplied transaction that has ALREADY set the RLS org context
 * (see `withOrg` / `setOrgConfig`). The BranchStock row is locked FOR UPDATE
 * first so two counter sales can never both spend the last unit on the shelf.
 *
 * Give it EITHER `delta` (signed: + for a delivery in, − for a sale out) OR
 * `setTo` (an absolute hand-counted figure). `setTo` is the safe way to set a
 * count: the target minus the current value is worked out AFTER the row is
 * locked, so a sale that lands between a caller's read and this call can't turn
 * an intended "set to N" into a wrong relative change.
 *
 * Throws `BRANCH_STOCK_NEGATIVE` if the shelf would go below zero — the caller
 * turns that into a friendly "only N left" message. Pass `allowFloor` when the
 * mover is authoritative and the shelf should simply bottom out at zero (a
 * warehouse return, where the salon may already have sold some of the units).
 *
 * Returns the locked before/after counts. A no-op (target already equals the
 * current count) writes nothing and records no movement.
 */
export async function bumpBranchStock(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string;
    branchId: string;
    productId: string;
    delta?: number;
    setTo?: number;
    reason: string;
    refId?: string | null;
    userId?: string | null;
    allowFloor?: boolean;
  }
): Promise<{ prev: number; next: number }> {
  const { orgId, branchId, productId, reason } = args;
  if ((args.delta === undefined) === (args.setTo === undefined)) {
    throw new Error("bumpBranchStock: pass exactly one of delta or setTo");
  }

  // Lock the shelf row for this product if it already exists.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "BranchStock" WHERE "branchId" = ${branchId} AND "productId" = ${productId} FOR UPDATE`
  );

  const existing = await tx.branchStock.findFirst({ where: { branchId, productId } });
  const prev = existing?.onHand ?? 0;
  // Compute the target UNDER the lock, so `setTo` is a true absolute set.
  let next = args.setTo ?? prev + (args.delta ?? 0);
  if (next < 0) {
    if (!args.allowFloor) throw new Error("BRANCH_STOCK_NEGATIVE");
    next = 0;
  }
  if (next === prev) return { prev, next };

  if (existing) {
    await tx.branchStock.update({ where: { id: existing.id }, data: { onHand: next } });
  } else {
    await tx.branchStock.create({ data: { orgId, branchId, productId, onHand: next } });
  }

  await tx.branchStockMovement.create({
    data: {
      orgId,
      branchId,
      productId,
      userId: args.userId ?? null,
      prevQty: prev,
      newQty: next,
      reason,
      refId: args.refId ?? null,
    },
  });

  return { prev, next };
}
