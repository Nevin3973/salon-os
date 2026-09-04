import { Prisma } from "@prisma/client";
import { financialYear, formatInvoiceCode, defaultPrefix } from "@/lib/gst";

/**
 * The tax invoice raised on a branch when the warehouse dispatches to it.
 *
 * Written as one function called from inside the dispatch transaction, so an
 * invoice can never exist for goods that did not move, nor goods move without
 * their invoice.
 */

export type TransferLine = {
  productId: string;
  name: string;
  hsn: string | null;
  unit: string;
  qty: number;
  /** Transfer rate per unit, exclusive of GST — the warehouse's purchase price. */
  rateCents: number;
  gstRate: number;
};

/**
 * Draws the next number in the warehouse's transfer series.
 *
 * One series for the whole warehouse rather than one per destination branch:
 * these are the warehouse's outward supplies and the client's accountant reads
 * them as a single run of documents, which is how Tally numbers them today.
 * Keyed on (location, FY) so it restarts each financial year, and locked FOR
 * UPDATE so two dispatches cannot take the same number.
 */
export async function nextTransferSeq(
  tx: Prisma.TransactionClient,
  args: { orgId: string; warehouseId: string; warehouseName: string; fy: string }
): Promise<{ seq: number; prefix: string }> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "InvoiceSeries" WHERE "branchId" = ${args.warehouseId} AND fy = ${args.fy} FOR UPDATE`
  );
  const existing = await tx.invoiceSeries.findFirst({
    where: { branchId: args.warehouseId, fy: args.fy },
  });
  if (existing) {
    const bumped = await tx.invoiceSeries.update({
      where: { id: existing.id },
      data: { seq: { increment: 1 } },
      select: { seq: true, prefix: true },
    });
    return { seq: bumped.seq, prefix: bumped.prefix };
  }
  const loc = await tx.location.findFirst({
    where: { id: args.warehouseId },
    select: { invoicePrefix: true },
  });
  const prefix = loc?.invoicePrefix?.trim() || defaultPrefix(args.warehouseName);
  const created = await tx.invoiceSeries.create({
    data: { orgId: args.orgId, branchId: args.warehouseId, fy: args.fy, prefix, seq: 1 },
    select: { seq: true, prefix: true },
  });
  return { seq: created.seq, prefix: created.prefix };
}

/**
 * Totals for a set of transfer lines.
 *
 * The tax is computed the way Tally computes it, and deliberately NOT the way
 * `lineGst` does. Tally applies HALF the rate to each line and rounds CGST and
 * SGST independently; `lineGst` applies the full rate, rounds once, then splits
 * the result. The two disagree by a paise or two per line — on the invoice the
 * client sent us, 882.46 against Tally's 882.48.
 *
 * That difference matters here and nowhere else. This document is handed to the
 * accountant to sit beside Tally's own copy of the same transfer, so a two-paise
 * gap is a discrepancy someone has to chase. A customer bill has no counterpart
 * in Tally to disagree with, which is why `lineGst` is left alone: changing it
 * would restate every retail invoice the platform has issued.
 *
 * The payable amount is then rounded to the whole rupee and the adjustment
 * recorded — Tally prints exactly that, a "Round Off" of (-)0.03.
 */
export function transferTotals(lines: TransferLine[]) {
  let subtotalCents = 0;
  let cgstCents = 0;
  let sgstCents = 0;
  const priced = lines.map((l) => {
    const netCents = Math.max(0, Math.round(l.rateCents)) * Math.max(0, Math.round(l.qty));
    // Half the rate, rounded on its own — then the same figure again for SGST.
    const halfCents = Math.round((netCents * l.gstRate) / 200);
    subtotalCents += netCents;
    cgstCents += halfCents;
    sgstCents += halfCents;
    return { ...l, taxableCents: netCents, cgstCents: halfCents, sgstCents: halfCents };
  });
  const taxCents = cgstCents + sgstCents;
  const beforeRounding = subtotalCents + taxCents;
  const totalCents = Math.round(beforeRounding / 100) * 100;
  return {
    lines: priced,
    subtotalCents,
    taxCents,
    cgstCents,
    sgstCents,
    roundOffCents: totalCents - beforeRounding,
    totalCents,
  };
}

/**
 * Writes the invoice for one dispatch. Returns null when nothing moved — a
 * dispatch that allocated no units is a no-op and must not burn a number in
 * the series, because a gap in an invoice run is a question at audit.
 */
export async function createTransferInvoice(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string;
    orderId: string;
    branchId: string;
    warehouseId: string;
    warehouseName: string;
    issuedByUserId: string;
    lines: TransferLine[];
    at?: Date;
  }
): Promise<{ id: string; invoiceNo: string } | null> {
  const lines = args.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) return null;

  const fy = financialYear(args.at ?? new Date());
  const { seq, prefix } = await nextTransferSeq(tx, {
    orgId: args.orgId,
    warehouseId: args.warehouseId,
    warehouseName: args.warehouseName,
    fy,
  });
  const invoiceNo = formatInvoiceCode(prefix, fy, seq);
  const totals = transferTotals(lines);

  const invoice = await tx.transferInvoice.create({
    data: {
      orgId: args.orgId,
      orderId: args.orderId,
      branchId: args.branchId,
      invoiceNo,
      fy,
      seq,
      issuedByUserId: args.issuedByUserId,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      roundOffCents: totals.roundOffCents,
      totalCents: totals.totalCents,
      items: {
        create: totals.lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          hsn: l.hsn,
          unit: l.unit,
          qty: l.qty,
          rateCents: l.rateCents,
          gstRate: l.gstRate,
          taxableCents: l.taxableCents,
          cgstCents: l.cgstCents,
          sgstCents: l.sgstCents,
        })),
      },
    },
    select: { id: true, invoiceNo: true },
  });
  return invoice;
}
