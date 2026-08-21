"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitSale, emitSaleReturn, emitVoid } from "@/lib/tally/outbox";
import { consumeBatchesFEFO } from "@/lib/batch-allocation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireVerifiedSession, setOrgConfig, withOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { verifyAuthCode } from "@/lib/authcode";
import { bumpBranchStock } from "@/lib/branch-stock";
import { normalisePhone } from "@/lib/customer";
import { reportError } from "@/lib/observability";
import {
  lineGst,
  billTotals,
  financialYear,
  formatInvoiceCode,
  formatCreditNoteCode,
  defaultPrefix,
} from "@/lib/gst";
import {
  VOID_SALE_REASONS,
  BRANCH_ADJUST_REASONS,
  SALE_RETURN_REASONS,
  PAYMENT_MODES,
} from "@/lib/constants";

export type SaleResult =
  | { ok: true; saleId: string }
  | { ok: false; error: string; productId?: string };

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

const recordSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1).max(100_000),
        discountCents: z.number().int().min(0).max(100_000_000).optional(),
      })
    )
    .min(1),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  /**
   * Which Staff record is credited with the sale — the person responsible for
   * it, not necessarily whoever operated the till. Null means the counter
   * itself: a walk-in nobody in particular is owed credit for. Kept explicit
   * rather than left blank so "nobody is owed commission" and "the cashier
   * skipped the step" are not the same silence.
   */
  staffId: z.string().min(1).nullable().optional(),
  buyerGstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || GSTIN_RE.test(v), "That GSTIN doesn't look valid.")
    .optional(),
  paymentMode: z.enum(PAYMENT_MODES),
});

/**
 * Draws the next invoice number for a branch, inside the caller's transaction.
 *
 * Indian practice is a separate series per place of business that restarts each
 * financial year, so the counter is keyed on (branch, FY): the first sale of a
 * new FY creates a fresh row starting at 1. The row is locked FOR UPDATE, which
 * serialises concurrent tills at the same branch and keeps the series gap-free.
 */
async function nextInvoiceSeq(
  tx: Prisma.TransactionClient,
  args: { orgId: string; branchId: string; branchName: string; fy: string }
): Promise<{ seq: number; prefix: string }> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "InvoiceSeries" WHERE "branchId" = ${args.branchId} AND fy = ${args.fy} FOR UPDATE`
  );
  const existing = await tx.invoiceSeries.findFirst({
    where: { branchId: args.branchId, fy: args.fy },
  });
  if (existing) {
    const bumped = await tx.invoiceSeries.update({
      where: { id: existing.id },
      data: { seq: { increment: 1 } },
      select: { seq: true, prefix: true },
    });
    return { seq: bumped.seq, prefix: bumped.prefix };
  }
  const branch = await tx.location.findFirst({
    where: { id: args.branchId },
    select: { invoicePrefix: true },
  });
  const prefix = branch?.invoicePrefix?.trim() || defaultPrefix(args.branchName);
  const created = await tx.invoiceSeries.create({
    data: { orgId: args.orgId, branchId: args.branchId, fy: args.fy, prefix, seq: 1 },
    select: { seq: true, prefix: true },
  });
  return { seq: created.seq, prefix: created.prefix };
}

/**
 * Rings up a counter sale. Runs in one transaction that:
 *  - locks every product's branch-shelf row and re-checks on-hand under the
 *    lock, so two tills can't both sell the last unit;
 *  - snapshots retail price, GST rate, HSN, discount and cost per line;
 *  - draws the branch's next invoice number for the current financial year;
 *  - rounds the payable amount to the whole rupee and records the adjustment;
 *  - draws the units off the branch shelf and writes the movements.
 *
 * Selling needs no authorization code — that gate is for buying supplies from
 * the warehouse. The salon manager is already authenticated for their branch.
 */
export async function recordSale(input: {
  lines: { productId: string; qty: number; discountCents?: number }[];
  customerName?: string;
  customerPhone?: string;
  buyerGstin?: string;
  paymentMode: (typeof PAYMENT_MODES)[number];
  staffId?: string | null;
}): Promise<SaleResult> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the bill." };
  }
  // Selling is the counter's daily job — open to salon staff and managers.
  const session = await requireVerifiedSession(["PURCHASE_MANAGER", "SALON_STAFF"]);
  const branchId = session.locationId;
  if (!branchId) return { ok: false, error: "Your account is not assigned to a branch." };

  // Credit may only go to an active staff member of THIS org, working either
  // at this branch or across branches. The id arrives straight from the
  // browser, so without this check a crafted request could attribute a sale —
  // and any commission on it — to anyone at all, including someone belonging
  // to a different tenant.
  //
  // Runs inside withOrg: Staff is behind FORCE row-level security, so the bare
  // client has no `app.org_id` and every lookup comes back empty — which read
  // as "that person isn't at this branch" for staff who plainly were. Membership
  // can be queried unscoped because it is deliberately RLS-exempt; Staff is not,
  // and the two are easy to confuse.
  let staffId: string | null = null;
  if (parsed.data.staffId) {
    const member = await withOrg(session.orgId, (tx) =>
      tx.staff.findFirst({
        where: {
          id: parsed.data.staffId!,
          orgId: session.orgId,
          isActive: true,
          OR: [{ branchId }, { branchId: null }],
        },
        select: { id: true },
      })
    );
    if (!member) return { ok: false, error: "That staff member isn't at this branch." };
    staffId = member.id;
  }

  // Collapse duplicate product lines so a product can't be split to dodge the
  // on-hand check; discounts on the same product add up.
  const qtyByProduct = new Map<string, number>();
  const discountByProduct = new Map<string, number>();
  for (const l of parsed.data.lines) {
    qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) ?? 0) + l.qty);
    discountByProduct.set(
      l.productId,
      (discountByProduct.get(l.productId) ?? 0) + (l.discountCents ?? 0)
    );
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

      // Build the priced lines and bill totals. A discount is clamped to the
      // line's gross so it can never make a line (or the bill) negative.
      const items = productIds.map((pid) => {
        const p = productById.get(pid)!;
        const qty = qtyByProduct.get(pid)!;
        const gross = p.retailPriceCents * qty;
        const discountCents = Math.min(discountByProduct.get(pid) ?? 0, gross);
        const g = lineGst(p.retailPriceCents, qty, p.gstRate, discountCents);
        return {
          productId: pid,
          name: p.name,
          hsn: p.hsn,
          qty,
          unitPriceCents: p.retailPriceCents,
          gstRate: p.gstRate,
          discountCents,
          lineNetCents: g.netCents,
          taxCents: g.taxCents,
          lineTotalCents: g.totalCents,
          unitCostCents: p.priceCents,
          // Written per line even though the counter picks one person for the
          // whole bill. Crediting individual products to different staff later
          // is then a UI change rather than a migration of history that cannot
          // be reconstructed.
          staffId,
        };
      });
      const totals = billTotals(
        items.map((it) => ({
          unitPriceCents: it.unitPriceCents,
          qty: it.qty,
          gstRate: it.gstRate,
          discountCents: it.discountCents,
        }))
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
          // Retire the oldest dated lots first. Best effort by design: the
          // register may not cover every unit on the shelf, and a sale must
          // never fail because a lot was never recorded.
          await consumeBatchesFEFO(tx, session.orgId, it.productId, branchId, it.qty);
        } catch (e) {
          if (e instanceof Error && e.message === "BRANCH_STOCK_NEGATIVE") {
            throw new Error(`SHORT:${it.productId}`);
          }
          throw e;
        }
      }

      // Next number in this branch's series for the current financial year.
      const branch = await tx.location.findFirst({
        where: { id: branchId, orgId: session.orgId },
        select: { name: true },
      });
      if (!branch) throw new Error("BRANCH_MISSING");
      const fy = financialYear();
      const { seq, prefix } = await nextInvoiceSeq(tx, {
        orgId: session.orgId,
        branchId,
        branchName: branch.name,
        fy,
      });

      /**
       * Build the customer master as bills are rung up.
       *
       * The phone is the identity — it is what a returning customer gives at
       * the counter, and the model is unique on (orgId, phone). Without this
       * every bill carried a loose name and number that belonged to nobody:
       * the Customer table stayed empty, so "what has this person bought
       * before?" had no answer even though the data was sitting in the sales.
       *
       * Normalised before lookup so +91, spaces and dashes all resolve to the
       * same person rather than creating three of them. No phone means a true
       * walk-in, and a walk-in is deliberately not a customer record — inventing
       * one per anonymous sale would fill the master with rows nobody can use.
       *
       * The name is only overwritten when a fresh one is given, so a later
       * blank bill cannot erase a customer's name.
       */
      const phone = normalisePhone(parsed.data.customerPhone ?? "");
      let customerId: string | null = null;
      if (phone) {
        const name = parsed.data.customerName?.trim() || null;
        const customer = await tx.customer.upsert({
          where: { orgId_phone: { orgId: session.orgId, phone } },
          create: { orgId: session.orgId, phone, name: name ?? "Customer" },
          update: name ? { name } : {},
        });
        customerId = customer.id;
      }

      const sale = await tx.sale.create({
        data: {
          orgId: session.orgId,
          branchId,
          invoiceNo: seq,
          invoiceCode: formatInvoiceCode(prefix, fy, seq),
          fy,
          soldByUserId: session.userId,
          customerId,
          customerName: parsed.data.customerName || null,
          customerPhone: phone || null,
          buyerGstin: parsed.data.buyerGstin || null,
          paymentMode: parsed.data.paymentMode,
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          taxCents: totals.taxCents,
          roundOffCents: totals.roundOffCents,
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
      await emitSale(tx, session.orgId, sale.id);
      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Billed ${sale.invoiceCode} — ${units} unit${units === 1 ? "" : "s"} sold`,
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

      await emitVoid(tx, session.orgId, sale.id);
      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Voided ${sale.invoiceCode} — ${parsed.data.reason}; stock returned to the shelf`,
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
// Partial return — customer brings some units back
// ————————————————————————————————————————————————————————

const returnSchema = z.object({
  saleId: z.string().min(1),
  reason: z.enum(SALE_RETURN_REASONS),
  note: z.string().trim().max(500).optional(),
  refundMode: z.enum(PAYMENT_MODES),
  authCode: z.string().min(1).max(64),
  lines: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        qty: z.number().int().min(0).max(100_000),
      })
    )
    .min(1),
});

/**
 * Takes some (or all) units back against a bill and raises a credit note.
 *
 * This is the everyday counter case, distinct from voiding: the original
 * invoice stays valid and untouched — as it must, once it has been given to a
 * customer and entered their books — and the reversal is recorded as its own
 * credit-note document. Quantities are clamped server-side to what remains
 * un-returned on each line, refunds are apportioned from the original line's
 * taxable value (so a discounted line refunds the discounted amount), and the
 * units go straight back onto the branch shelf.
 *
 * Money flowing back out means manager-only plus the branch authorization code.
 */
export async function returnSaleItems(input: {
  saleId: string;
  reason: (typeof SALE_RETURN_REASONS)[number];
  note?: string;
  refundMode: (typeof PAYMENT_MODES)[number];
  authCode: string;
  lines: { saleItemId: string; qty: number }[];
}): Promise<SaleResult> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.path[0] === "authCode"
          ? "Enter the authorization code."
          : "Check the return quantities and reason.",
    };
  }
  const session = await requireVerifiedSession("PURCHASE_MANAGER");
  const branchId = session.locationId;
  if (!branchId) return { ok: false, error: "Your account is not assigned to a branch." };

  const verified = await verifyAuthCode(session, branchId, parsed.data.authCode);
  if (!verified.ok) return { ok: false, error: verified.error };

  const askedFor = new Map(parsed.data.lines.map((l) => [l.saleItemId, l.qty]));

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Sale" WHERE id = ${parsed.data.saleId} AND "orgId" = ${session.orgId} FOR UPDATE`
      );

      const sale = await tx.sale.findFirst({
        where: { id: parsed.data.saleId, orgId: session.orgId, branchId },
        include: { items: true, branch: { select: { name: true } } },
      });
      if (!sale) throw new Error("NOT_FOUND");
      if (sale.status === "VOID") throw new Error("SALE_VOID");
      if (sale.status === "RETURNED") throw new Error("FULLY_RETURNED");

      const returnItems: {
        saleItemId: string;
        productId: string;
        qty: number;
        lineNetCents: number;
        taxCents: number;
        lineTotalCents: number;
      }[] = [];

      for (const item of sale.items) {
        const remaining = item.qty - item.returnedQty;
        // Clamp to what is actually left on the line, whatever the client sent.
        const qty = Math.min(Math.max(0, askedFor.get(item.id) ?? 0), remaining);
        if (qty === 0) continue;

        // Apportion from the line's own taxable value so any discount given at
        // sale time is refunded at the same rate the customer actually paid.
        const lineNetCents = Math.round((item.lineNetCents * qty) / item.qty);
        const taxCents = Math.round((lineNetCents * item.gstRate) / 100);
        returnItems.push({
          saleItemId: item.id,
          productId: item.productId,
          qty,
          lineNetCents,
          taxCents,
          lineTotalCents: lineNetCents + taxCents,
        });
      }

      if (returnItems.length === 0) throw new Error("NOTHING_TO_RETURN");

      // Put the units back on the shelf and mark the lines.
      for (const r of returnItems) {
        await bumpBranchStock(tx, {
          orgId: session.orgId,
          branchId,
          productId: r.productId,
          delta: r.qty,
          reason: "Customer return",
          refId: sale.id,
          userId: session.userId,
        });
        await tx.saleItem.update({
          where: { id: r.saleItemId },
          data: { returnedQty: { increment: r.qty } },
        });
      }

      // Credit notes run on their own series per branch and financial year,
      // keyed separately so they can never collide with invoice numbers.
      const fy = financialYear();
      const { seq, prefix } = await nextInvoiceSeq(tx, {
        orgId: session.orgId,
        branchId,
        branchName: sale.branch.name,
        fy: `CN-${fy}`,
      });

      const subtotalCents = returnItems.reduce((s, r) => s + r.lineNetCents, 0);
      const taxCents = returnItems.reduce((s, r) => s + r.taxCents, 0);

      const credit = await tx.saleReturn.create({
        data: {
          orgId: session.orgId,
          branchId,
          saleId: sale.id,
          creditNoteCode: formatCreditNoteCode(prefix, fy, seq),
          reason: parsed.data.reason,
          note: parsed.data.note || null,
          refundMode: parsed.data.refundMode,
          subtotalCents,
          taxCents,
          totalCents: subtotalCents + taxCents,
          createdByUserId: session.userId,
          items: { create: returnItems },
        },
      });

      // Fully returned once every line has come back.
      const stillHeld = sale.items.reduce((sum, it) => {
        const back = returnItems.find((r) => r.saleItemId === it.id)?.qty ?? 0;
        return sum + (it.qty - it.returnedQty - back);
      }, 0);
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: stillHeld === 0 ? "RETURNED" : "PARTIALLY_RETURNED" },
      });

      const units = returnItems.reduce((s, r) => s + r.qty, 0);
      // Credit note queued for Tally inside the same transaction: the
      // event cannot exist without the return, or the return without it.
      await emitSaleReturn(tx, session.orgId, credit.id);
      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Return ${credit.creditNoteCode} against ${sale.invoiceCode} — ${units} unit${
          units === 1 ? "" : "s"
        } back, refunded ${parsed.data.refundMode.toLowerCase()} (${parsed.data.reason})`,
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
  /**
   * Which pool to set. Defaults to RETAIL so existing callers are unchanged.
   * This is also the only way stock enters SALON_USE today: warehouse
   * deliveries land on the shelf, and a manager moves what the back bar needs
   * by counting it into this pool.
   */
  kind: z.enum(["RETAIL", "SALON_USE"]).optional(),
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
  kind?: "RETAIL" | "SALON_USE";
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

      // Absolute set, resolved under the row lock (see bumpBranchStock) so a
      // concurrent sale can't turn "set to N" into a wrong relative change.
      const { prev, next } = await bumpBranchStock(tx, {
        orgId: session.orgId,
        branchId,
        productId: product.id,
        kind: parsed.data.kind ?? "RETAIL",
        setTo: parsed.data.newOnHand,
        reason: `Adjustment · ${parsed.data.reason}`,
        userId: session.userId,
      });
      if (prev === next) return; // nothing actually changed

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Adjusted shelf count for ${product.name}: ${prev} → ${next} (${parsed.data.reason})`,
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

// ————————————————————————————————————————————————————————
// Rack / bin location
// ————————————————————————————————————————————————————————

const rackSchema = z.object({
  productId: z.string().min(1),
  rackId: z.string().trim().max(24), // empty string clears it
});

/**
 * Sets (or clears) a product's physical rack/bin label at this branch — just a
 * locator to help staff grab it fast while billing. No stock or money moves, so
 * it's manager-only but needs no authorization code.
 */
export async function setBranchRack(input: { productId: string; rackId: string }): Promise<SaleResult> {
  const parsed = rackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Rack label is too long (max 24 characters)." };
  const session = await requireVerifiedSession("PURCHASE_MANAGER");
  const branchId = session.locationId;
  if (!branchId) return { ok: false, error: "Your account is not assigned to a branch." };
  const rack = parsed.data.rackId.trim() || null;

  try {
    await withOrg(session.orgId, async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: parsed.data.productId, orgId: session.orgId },
        select: { id: true },
      });
      if (!product) throw new Error("PRODUCT_MISSING");
      // The rack label is where the sellable stock physically sits, so it
      // belongs to the RETAIL row. Salon-use stock lives at the back bar and
      // is not something a cashier looks up while billing.
      await tx.branchStock.upsert({
        where: {
          branchId_productId_kind: { branchId, productId: product.id, kind: "RETAIL" },
        },
        update: { rackId: rack },
        create: {
          orgId: session.orgId,
          branchId,
          productId: product.id,
          kind: "RETAIL",
          onHand: 0,
          rackId: rack,
        },
      });
    });
  } catch (e) {
    return saleError(e);
  }

  revalidatePath("/salon/inventory");
  revalidatePath("/salon/sell");
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
  if (raw === "BRANCH_MISSING") return { ok: false, error: "Your branch could not be found." };
  if (raw === "NOT_FOUND") return { ok: false, error: "Bill not found." };
  if (raw === "ALREADY_VOID") return { ok: false, error: "This bill has already been voided." };
  if (raw === "SALE_VOID") return { ok: false, error: "This bill was voided — there is nothing to return." };
  if (raw === "FULLY_RETURNED") return { ok: false, error: "Everything on this bill has already come back." };
  if (raw === "NOTHING_TO_RETURN") return { ok: false, error: "Enter how many units are coming back." };

  // Everything above is a case we anticipated and explained to the cashier.
  // Reaching here means something genuinely unplanned happened on a path that
  // moves money or stock, and the counter just saw "please try again" — this is
  // the one failure nobody would otherwise hear about.
  reportError(e, { where: "sales" });
  return { ok: false, error: "Something went wrong. Please try again." };
}

// ————————————————————————————————————————————————————————
// Till display settings
// ————————————————————————————————————————————————————————

/**
 * Hides or shows a product category on this branch's till.
 *
 * A speed control, not a permission. A branch that never sells cleaning
 * supplies should not scroll past them mid-queue — but the category stays in
 * inventory and reports, and a scanned barcode still sells, because refusing a
 * product the cashier is physically holding on the basis of a display filter
 * would be a worse bug than the clutter it saves.
 *
 * Manager-only: a cashier changing what the till shows mid-shift is exactly the
 * kind of quiet change that makes a day's takings hard to explain.
 */
export async function setPosCategoryHidden(input: {
  category: string;
  hidden: boolean;
}): Promise<SaleResult> {
  const parsed = z
    .object({ category: z.string().trim().min(1).max(80), hidden: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a category." };

  const session = await requireVerifiedSession("PURCHASE_MANAGER");
  const branchId = session.locationId;
  if (!branchId) return { ok: false, error: "Your account is not assigned to a branch." };

  try {
    await withOrg(session.orgId, async (tx) => {
      const branch = await tx.location.findFirst({
        where: { id: branchId, orgId: session.orgId },
        select: { posHiddenCategories: true },
      });
      if (!branch) throw new Error("BRANCH_MISSING");

      const current = new Set(branch.posHiddenCategories);
      if (parsed.data.hidden) current.add(parsed.data.category);
      else current.delete(parsed.data.category);

      await tx.location.update({
        where: { id: branchId },
        data: { posHiddenCategories: [...current].sort() },
      });
    });
  } catch (e) {
    return saleError(e);
  }

  revalidatePath("/salon/sell");
  revalidatePath("/salon/inventory");
  return { ok: true, saleId: "" };
}
