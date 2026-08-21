"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireVerifiedSession, setOrgConfig } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { bumpBranchStock } from "@/lib/branch-stock";
import { emitWriteOff } from "@/lib/tally/outbox";

export type ActionResult = { ok: true } | { ok: false; error: string };

const EXPIRY_REASONS = ["Expired", "Short-dated", "Damaged", "Recalled", "Other"] as const;

/** Record a dated lot against a product. */
export async function recordBatch(input: {
  productId: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  branchId?: string | null;
}): Promise<ActionResult> {
  const parsed = z
    .object({
      productId: z.string().min(1),
      batchNo: z.string().min(1).max(64),
      expiryDate: z.string().min(1),
      qty: z.number().int().min(1),
      branchId: z.string().min(1).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the batch number, date and quantity." };

  const expiry = new Date(`${parsed.data.expiryDate}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return { ok: false, error: "That expiry date is not valid." };

  const session = await requireVerifiedSession(["WAREHOUSE_MANAGER", "PURCHASE_MANAGER"]);
  const branchId = parsed.data.branchId ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      const product = await tx.product.findFirst({
        where: { id: parsed.data.productId, orgId: session.orgId },
        select: { id: true, name: true },
      });
      if (!product) throw new Error("PRODUCT_MISSING");

      // Same lot at the same place is one row: recording it twice means more
      // arrived, not that a second batch exists.
      const existing = await tx.productBatch.findFirst({
        where: { productId: product.id, batchNo: parsed.data.batchNo, branchId },
        select: { id: true, qty: true },
      });

      if (existing) {
        await tx.productBatch.update({
          where: { id: existing.id },
          data: { qty: existing.qty + parsed.data.qty, expiryDate: expiry, status: "ACTIVE" },
        });
      } else {
        await tx.productBatch.create({
          data: {
            orgId: session.orgId,
            productId: product.id,
            batchNo: parsed.data.batchNo,
            expiryDate: expiry,
            qty: parsed.data.qty,
            branchId,
            createdByUserId: session.userId,
          },
        });
      }

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Recorded batch ${parsed.data.batchNo} of ${product.name} — ${parsed.data.qty} units, expires ${parsed.data.expiryDate}`,
        entityType: "ProductBatch",
        entityId: product.id,
      });
    });
  } catch (e) {
    return batchError(e);
  }

  revalidatePath("/warehouse/expiry");
  revalidatePath("/purchase-manager/expiry");
  return { ok: true };
}

/** Pull a lot from sale without disposing of it yet. */
export async function quarantineBatch(input: {
  batchId: string;
  reason: string;
  note?: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({
      batchId: z.string().min(1),
      reason: z.enum(EXPIRY_REASONS),
      note: z.string().max(280).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a reason for pulling this batch." };

  const session = await requireVerifiedSession(["WAREHOUSE_MANAGER", "PURCHASE_MANAGER"]);

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      const batch = await tx.productBatch.findFirst({
        where: { id: parsed.data.batchId, orgId: session.orgId },
        include: { product: { select: { name: true } } },
      });
      if (!batch) throw new Error("BATCH_MISSING");
      if (batch.status === "WRITTEN_OFF") throw new Error("ALREADY_WRITTEN_OFF");

      await tx.productBatch.update({
        where: { id: batch.id },
        data: { status: "QUARANTINED", reason: parsed.data.reason, note: parsed.data.note || null },
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Quarantined batch ${batch.batchNo} of ${batch.product.name} — ${batch.qty} units (${parsed.data.reason})`,
        entityType: "ProductBatch",
        entityId: batch.id,
      });
    });
  } catch (e) {
    return batchError(e);
  }

  revalidatePath("/warehouse/expiry");
  revalidatePath("/purchase-manager/expiry");
  return { ok: true };
}

/** Send a lot back from a branch to the central warehouse. */
export async function returnBatchToWarehouse(input: { batchId: string }): Promise<ActionResult> {
  const parsed = z.object({ batchId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That batch could not be identified." };

  const session = await requireVerifiedSession(["WAREHOUSE_MANAGER", "PURCHASE_MANAGER"]);

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      const batch = await tx.productBatch.findFirst({
        where: { id: parsed.data.batchId, orgId: session.orgId },
        include: { product: { select: { name: true } } },
      });
      if (!batch) throw new Error("BATCH_MISSING");
      if (!batch.branchId) throw new Error("ALREADY_AT_WAREHOUSE");
      if (batch.status === "WRITTEN_OFF") throw new Error("ALREADY_WRITTEN_OFF");

      const fromBranchId = batch.branchId;

      // The units physically leave the salon, so the shelf has to move too.
      // Floored at zero: the branch may have sold or used some before anyone
      // noticed the date, and the physical return is what is authoritative.
      await bumpBranchStock(tx, {
        orgId: session.orgId,
        branchId: fromBranchId,
        productId: batch.productId,
        delta: -batch.qty,
        reason: "Expired stock returned to warehouse",
        refId: batch.id,
        userId: session.userId,
        allowFloor: true,
      });

      const product = await tx.product.findFirst({
        where: { id: batch.productId, orgId: session.orgId },
        select: { stock: true },
      });
      if (!product) throw new Error("PRODUCT_MISSING");

      await tx.stockMovement.create({
        data: {
          orgId: session.orgId,
          productId: batch.productId,
          userId: session.userId,
          prevQty: product.stock,
          newQty: product.stock + batch.qty,
          action: `Expired return · batch ${batch.batchNo}`,
        },
      });
      await tx.product.update({
        where: { id: batch.productId },
        data: { stock: product.stock + batch.qty },
      });

      // The lot itself moves, and stays quarantined so it cannot be dispatched
      // back out by mistake.
      await tx.productBatch.update({
        where: { id: batch.id },
        data: { branchId: null, status: "QUARANTINED" },
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Returned batch ${batch.batchNo} of ${batch.product.name} to the warehouse — ${batch.qty} units`,
        entityType: "ProductBatch",
        entityId: batch.id,
      });
    });
  } catch (e) {
    return batchError(e);
  }

  revalidatePath("/warehouse/expiry");
  revalidatePath("/purchase-manager/expiry");
  return { ok: true };
}

/** Dispose of a lot. Takes the stock out of the ledger and books it to Tally. */
export async function writeOffBatch(input: {
  batchId: string;
  reason: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ batchId: z.string().min(1), reason: z.enum(EXPIRY_REASONS) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a reason for the write-off." };

  const session = await requireVerifiedSession("WAREHOUSE_MANAGER");

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      const batch = await tx.productBatch.findFirst({
        where: { id: parsed.data.batchId, orgId: session.orgId },
        include: { product: { select: { name: true, stock: true } } },
      });
      if (!batch) throw new Error("BATCH_MISSING");
      if (batch.status === "WRITTEN_OFF") throw new Error("ALREADY_WRITTEN_OFF");
      if (batch.qty <= 0) throw new Error("NOTHING_TO_WRITE_OFF");

      const disposed = batch.qty;

      if (batch.branchId) {
        await bumpBranchStock(tx, {
          orgId: session.orgId,
          branchId: batch.branchId,
          productId: batch.productId,
          delta: -disposed,
          reason: `Write-off · ${parsed.data.reason}`,
          refId: batch.id,
          userId: session.userId,
          allowFloor: true,
        });
      } else {
        // Clamped at zero. The batch register annotates stock rather than
        // owning it, so a stale batch figure must never be able to push the
        // warehouse negative — that is precisely the fault the client already
        // has in their Tally data.
        const removed = Math.min(disposed, batch.product.stock);
        if (removed > 0) {
          await tx.stockMovement.create({
            data: {
              orgId: session.orgId,
              productId: batch.productId,
              userId: session.userId,
              prevQty: batch.product.stock,
              newQty: batch.product.stock - removed,
              action: `Write-off · batch ${batch.batchNo} (${parsed.data.reason})`,
            },
          });
          await tx.product.update({
            where: { id: batch.productId },
            data: { stock: batch.product.stock - removed },
          });
        }
      }

      await emitWriteOff(tx, session.orgId, batch.id, disposed, parsed.data.reason);

      // qty is zeroed but the row is kept: the write-off has to stay auditable,
      // and a deleted row cannot be reconciled against Tally later.
      await tx.productBatch.update({
        where: { id: batch.id },
        data: { status: "WRITTEN_OFF", qty: 0, reason: parsed.data.reason },
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Wrote off batch ${batch.batchNo} of ${batch.product.name} — ${disposed} units (${parsed.data.reason})`,
        entityType: "ProductBatch",
        entityId: batch.id,
      });
    });
  } catch (e) {
    return batchError(e);
  }

  revalidatePath("/warehouse/expiry");
  revalidatePath("/purchase-manager/expiry");
  revalidatePath("/warehouse/inventory");
  return { ok: true };
}

function batchError(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : "";
  if (raw === "BATCH_MISSING") return { ok: false, error: "That batch no longer exists." };
  if (raw === "PRODUCT_MISSING") return { ok: false, error: "That product no longer exists." };
  if (raw === "ALREADY_WRITTEN_OFF") return { ok: false, error: "This batch has already been written off." };
  if (raw === "ALREADY_AT_WAREHOUSE") return { ok: false, error: "This batch is already at the warehouse." };
  if (raw === "NOTHING_TO_WRITE_OFF") return { ok: false, error: "There are no units left in this batch." };
  return { ok: false, error: "Something went wrong. Try again." };
}
