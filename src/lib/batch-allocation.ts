import type { Prisma } from "@prisma/client";

/// First-expiry-first-out allocation over the batch register.
///
/// BEST EFFORT, AND DELIBERATELY SO. The register annotates stock rather than
/// owning it: lots are recorded as receipts arrive from Tally, so early on it
/// covers only part of what is physically on the shelf. Allocation therefore
/// consumes what it knows about and ignores the rest — it never blocks a sale
/// or a dispatch because a lot is missing.
///
/// The alternative, refusing to move stock the register cannot account for,
/// would take a partially populated table and turn it into a till that stops
/// serving customers. A slightly incomplete expiry picture is a reporting
/// problem; a till that refuses a scanned product is a trading one.
///
/// Quarantined lots are never allocated. They have been pulled from sale, and
/// the whole point of pulling them is that they must not go out.

type Tx = Prisma.TransactionClient;

export type ConsumedLot = { batchId: string; batchNo: string; qty: number; expiryDate: Date };

/// Draw `qty` units from the lots held at one location, earliest expiry first.
///
/// `branchId` null means the central warehouse. Returns the lots actually
/// consumed, which may total less than `qty` — see the note above.
export async function consumeBatchesFEFO(
  tx: Tx,
  orgId: string,
  productId: string,
  branchId: string | null,
  qty: number,
): Promise<ConsumedLot[]> {
  if (qty <= 0) return [];

  const lots = await tx.productBatch.findMany({
    where: { orgId, productId, branchId, status: "ACTIVE", qty: { gt: 0 } },
    // Earliest expiry first; the id breaks ties so two lots sharing a date are
    // consumed in a stable order rather than whatever the planner returns.
    orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
  });

  const consumed: ConsumedLot[] = [];
  let left = qty;

  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.qty);
    await tx.productBatch.update({
      where: { id: lot.id },
      data: { qty: lot.qty - take },
    });
    consumed.push({ batchId: lot.id, batchNo: lot.batchNo, qty: take, expiryDate: lot.expiryDate });
    left -= take;
  }

  return consumed;
}

/// Move `qty` units of a product from the warehouse's lots onto a branch's,
/// preserving batch number and expiry.
///
/// Without this a dispatch would strip the warehouse's lots and the units would
/// arrive at the salon with no date attached, so the branch expiry report would
/// stay empty however much dated stock it was actually holding.
export async function transferBatchesFEFO(
  tx: Tx,
  orgId: string,
  productId: string,
  branchId: string,
  qty: number,
): Promise<ConsumedLot[]> {
  const taken = await consumeBatchesFEFO(tx, orgId, productId, null, qty);

  for (const lot of taken) {
    const existing = await tx.productBatch.findFirst({
      where: { orgId, productId, batchNo: lot.batchNo, branchId },
      select: { id: true, qty: true },
    });

    if (existing) {
      await tx.productBatch.update({
        where: { id: existing.id },
        data: { qty: existing.qty + lot.qty },
      });
    } else {
      await tx.productBatch.create({
        data: {
          orgId,
          productId,
          batchNo: lot.batchNo,
          expiryDate: lot.expiryDate,
          qty: lot.qty,
          branchId,
        },
      });
    }
  }

  return taken;
}
