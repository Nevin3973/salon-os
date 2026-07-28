"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireVerifiedSession, setOrgConfig } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { verifyAuthCode } from "@/lib/authcode";
import { bumpBranchStock } from "@/lib/branch-stock";
import { lineGst, billTotals, invoiceCode } from "@/lib/gst";
import { VOID_SALE_REASONS, BRANCH_ADJUST_REASONS, PAYMENT_MODES } from "@/lib/constants";

export type SaleResult =
  | { ok: true; saleId: string }
  | { ok: false; error: string; productId?: string };

const recordSchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(100_000) }))
    .min(1),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  paymentMode: z.enum(PAYMENT_MODES),
});

/**
 * Rings up a counter sale. Runs in one transaction that:
 *  - locks every product's branch-shelf row and re-checks on-hand under the
 *    lock, so two tills can't both sell the last unit;
 *  - snapshots retail price, GST rate, HSN and cost per line;
 *  - bumps the org's invoice counter atomically for a gap-free number;
 *  - draws the units off the branch shelf and writes the movements.
 *
 * Selling needs no authorization code — that gate is for buying supplies from
 * the warehouse. The salon manager is already authenticated for their branch.
 */
export async function recordSale(input: {
  lines: { productId: string; qty: number }[];
  customerName?: string;
  customerPhone?: string;
  paymentMode: (typeof PAYMENT_MODES)[number];
}): Promise<SaleResult> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the bill." };
  }
  // Selling is the counter's daily job — open to salon staff and managers.
  const session = await requireVerifiedSession(["PURCHASE_MANAGER", "SALON_STAFF"]);
  const branchId = session.locationId;
  if (!branchId) return { ok: false, error: "Your account is not assigned to a branch." };

  // Collapse duplicate product lines so a product can't be split to dodge the
  // on-hand check.
  const qtyByProduct = new Map<string, number>();
  for (const l of parsed.data.lines) {
    qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) ?? 0) + l.qty);
  }
  const productIds = [...qtyByProduct.keys()];

  let saleId = "";
  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);

      const products = await tx.product.findMany({
        where: { id: { in: productIds }, orgId: session.orgId },
      });
      if (products.length !== productIds.length) throw new Error("PRODUCT_MISSING");
      const productById = new Map(products.map((p) => [p.id, p]));

      for (const p of products) {
        if (!p.active) throw new Error(`INACTIVE:${p.id}`);
        if (p.retailPriceCents <= 0) throw new Error(`NO_PRICE:${p.id}`);
      }

      // Build the priced lines and bill totals.
      const items = productIds.map((pid) => {
        const p = productById.get(pid)!;
        const qty = qtyByProduct.get(pid)!;
        const g = lineGst(p.retailPriceCents, qty, p.gstRate);
        return {
          productId: pid,
          name: p.name,
          hsn: p.hsn,
          qty,
          unitPriceCents: p.retailPriceCents,
          gstRate: p.gstRate,
          lineNetCents: g.netCents,
          taxCents: g.taxCents,
          lineTotalCents: g.totalCents,
          unitCostCents: p.priceCents,
        };
      });
      const totals = billTotals(
        items.map((it) => ({ unitPriceCents: it.unitPriceCents, qty: it.qty, gstRate: it.gstRate }))
      );
      const costCents = items.reduce((s, it) => s + it.unitCostCents * it.qty, 0);

      // Draw the stock off the shelf (locks + re-checks on-hand).
      for (const it of items) {
        try {
          await bumpBranchStock(tx, {
            orgId: session.orgId,
            branchId,
            productId: it.productId,
            delta: -it.qty,
            reason: "Sale",
            userId: session.userId,
          });
        } catch (e) {
          if (e instanceof Error && e.message === "BRANCH_STOCK_NEGATIVE") {
            throw new Error(`SHORT:${it.productId}`);
          }
          throw e;
        }
      }

      // Gap-free per-org invoice number.
      const org = await tx.org.update({
        where: { id: session.orgId },
        data: { saleSeq: { increment: 1 } },
        select: { saleSeq: true },
      });
      const invoiceNo = org.saleSeq;

      const sale = await tx.sale.create({
        data: {
          orgId: session.orgId,
          branchId,
          invoiceNo,
          soldByUserId: session.userId,
          customerName: parsed.data.customerName || null,
          customerPhone: parsed.data.customerPhone || null,
          paymentMode: parsed.data.paymentMode,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          costCents,
          items: { create: items },
        },
      });
      saleId = sale.id;

      // Point the shelf movements at the sale they belong to.
      await tx.branchStockMovement.updateMany({
        where: { branchId, reason: "Sale", refId: null, productId: { in: productIds } },
        data: { refId: sale.id },
      });

      const units = items.reduce((s, it) => s + it.qty, 0);
      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Billed ${invoiceCode(invoiceNo)} — ${units} unit${units === 1 ? "" : "s"} sold`,
        entityType: "Sale",
        entityId: sale.id,
      });
    });
  } catch (e) {
    return saleError(e);
  }

  revalidatePath("/salon/sell");
  revalidatePath("/salon/bills");
  revalidatePath("/salon/inventory");
  revalidatePath("/salon/reports");
  return { ok: true, saleId };
}

// ————————————————————————————————————————————————————————
// Voiding a bill — returns its units to the shelf
// ————————————————————————————————————————————————————————

const voidSchema = z.object({
  saleId: z.string().min(1),
  reason: z.enum(VOID_SALE_REASONS),
  authCode: z.string().min(1).max(64),
});

/**
 * Voids a bill and returns its units to the shelf. A financial reversal, so
 * it is manager-only AND gated behind the branch authorization code — the same
 * approval used for spending. Cashiers cannot reach it at all.
 */
export async function voidSale(input: {
  saleId: string;
  reason: (typeof VOID_SALE_REASONS)[number];
  authCode: string;
}): Promise<SaleResult> {
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.path[0] === "authCode" ? "Enter the authorization code." : "Pick a reason for voiding this bill." };
  }
  const session = await requireVerifiedSession("PURCHASE_MANAGER");
  const branchId = session.locationId;
  if (!branchId) return { ok: false, error: "Your account is not assigned to a branch." };

  const verified = await verifyAuthCode(session, branchId, parsed.data.authCode);
  if (!verified.ok) return { ok: false, error: verified.error };

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Sale" WHERE id = ${parsed.data.saleId} AND "orgId" = ${session.orgId} FOR UPDATE`
      );

      const sale = await tx.sale.findFirst({
        where: { id: parsed.data.saleId, orgId: session.orgId, branchId },
        include: { items: true },
      });
      if (!sale) throw new Error("NOT_FOUND");
      if (sale.status !== "COMPLETED") throw new Error("ALREADY_VOID");

      for (const it of sale.items) {
        await bumpBranchStock(tx, {
          orgId: session.orgId,
          branchId,
          productId: it.productId,
          delta: it.qty,
          reason: "Void sale",
          refId: sale.id,
          userId: session.userId,
        });
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: "VOID", voidReason: parsed.data.reason },
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Voided ${invoiceCode(sale.invoiceNo)} — ${parsed.data.reason}; stock returned to the shelf`,
        entityType: "Sale",
        entityId: sale.id,
      });
    });
  } catch (e) {
    return saleError(e);
  }

  revalidatePath("/salon/bills");
  revalidatePath("/salon/inventory");
  revalidatePath("/salon/reports");
  return { ok: true, saleId: parsed.data.saleId };
}

// ————————————————————————————————————————————————————————
// Manual shelf adjustment
// ————————————————————————————————————————————————————————

const adjustSchema = z.object({
  productId: z.string().min(1),
  newOnHand: z.number().int().min(0).max(1_000_000),
  reason: z.enum(BRANCH_ADJUST_REASONS),
  authCode: z.string().min(1).max(64),
});

/**
 * Sets a product's shelf count to a hand-taken figure, logging the delta.
 * Hand-adjustments can hide shrinkage, so — like voiding — this is manager-only
 * and requires the branch authorization code.
 */
export async function adjustBranchStock(input: {
  productId: string;
  newOnHand: number;
  reason: (typeof BRANCH_ADJUST_REASONS)[number];
  authCode: string;
}): Promise<SaleResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.path[0] === "authCode" ? "Enter the authorization code." : "Check the count and reason." };
  }
  const session = await requireVerifiedSession("PURCHASE_MANAGER");
  const branchId = session.locationId;
  if (!branchId) return { ok: false, error: "Your account is not assigned to a branch." };

  const verified = await verifyAuthCode(session, branchId, parsed.data.authCode);
  if (!verified.ok) return { ok: false, error: verified.error };

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      const product = await tx.product.findFirst({
        where: { id: parsed.data.productId, orgId: session.orgId },
        select: { id: true, name: true },
      });
      if (!product) throw new Error("PRODUCT_MISSING");

      const existing = await tx.branchStock.findFirst({
        where: { branchId, productId: product.id },
      });
      const prev = existing?.onHand ?? 0;
      const delta = parsed.data.newOnHand - prev;
      if (delta === 0) return;

      await bumpBranchStock(tx, {
        orgId: session.orgId,
        branchId,
        productId: product.id,
        delta,
        reason: `Adjustment · ${parsed.data.reason}`,
        userId: session.userId,
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Adjusted shelf count for ${product.name}: ${prev} → ${parsed.data.newOnHand} (${parsed.data.reason})`,
        entityType: "Product",
        entityId: product.id,
      });
    });
  } catch (e) {
    return saleError(e);
  }

  revalidatePath("/salon/inventory");
  return { ok: true, saleId: "" };
}

function saleError(e: unknown): SaleResult {
  const raw = e instanceof Error ? e.message : "";
  if (raw.startsWith("SHORT:")) {
    return { ok: false, error: "Not enough on the shelf — refresh and try a smaller quantity.", productId: raw.slice(6) };
  }
  if (raw.startsWith("INACTIVE:")) {
    return { ok: false, error: "One of these products is no longer for sale.", productId: raw.slice(9) };
  }
  if (raw.startsWith("NO_PRICE:")) {
    return { ok: false, error: "A retail price hasn't been set for one of these products yet.", productId: raw.slice(9) };
  }
  if (raw === "PRODUCT_MISSING") return { ok: false, error: "A product on this bill no longer exists." };
  if (raw === "NOT_FOUND") return { ok: false, error: "Bill not found." };
  if (raw === "ALREADY_VOID") return { ok: false, error: "This bill has already been voided." };
  return { ok: false, error: "Something went wrong. Please try again." };
}
