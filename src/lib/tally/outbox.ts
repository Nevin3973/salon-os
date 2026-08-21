import type { Prisma } from "@prisma/client";
import { amt, rate, toTallyDate } from "./format";

/// Emitters for the Tally outbound queue.
///
/// Every emitter runs INSIDE the same transaction as the business write, so an
/// event cannot exist without the transaction that caused it, and vice versa.
/// A sale that commits while its outbox row fails would go missing from Tally
/// with nothing to show it ever should have been there.
///
/// Emitting is idempotent on `externalRef`: replaying an emit is a no-op rather
/// than a duplicate voucher.

type Tx = Prisma.TransactionClient;

/// Master data for the items on a document. Sent alongside the lines because
/// Tally cannot import a voucher referencing a stock item it doesn't hold —
/// the connector creates any missing masters first.
function stockItems(lines: Array<{ productId: string; name: string; hsn: string | null; gstRate: number }>) {
  const seen = new Set<string>();
  const out: Array<Record<string, string>> = [];
  for (const li of lines) {
    if (seen.has(li.productId)) continue;
    seen.add(li.productId);
    out.push({
      NAME: li.name,
      "TAX RATE": rate(li.gstRate),
      HSN: li.hsn ?? "",
      "CESS RATE": rate(0),
    });
  }
  return out;
}

async function enqueue(
  tx: Tx,
  row: {
    orgId: string;
    branchId: string | null;
    eventType: string;
    entityId: string;
    externalRef: string;
    payload: Prisma.InputJsonValue;
    occurredAt: Date;
  },
) {
  await tx.tallyOutbox.upsert({
    where: { orgId_externalRef: { orgId: row.orgId, externalRef: row.externalRef } },
    // A replayed emit must not create a second voucher, and must not rewrite
    // the snapshot already queued — the first capture is the truthful one.
    update: {},
    create: row,
  });
}

/// A retail bill raised at a salon till. Becomes a Sales Invoice in Tally.
export async function emitSale(tx: Tx, orgId: string, saleId: string) {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, orgId },
    include: { items: true, branch: { select: { name: true, invoicePrefix: true } } },
  });
  // Anything that arrived FROM Tally is never published back to it; see
  // TxnOrigin in the schema for why.
  if (!sale || sale.origin !== "SALON_OS") return;

  const payload = {
    REF: `SO-SALE-${sale.invoiceCode}`,
    TYPE: "SALE",
    TRANSDATE: toTallyDate(sale.createdAt),
    SABILLNO: sale.invoiceCode,
    BRANCH: { CODE: sale.branch.invoicePrefix ?? "", NAME: sale.branch.name },
    PARTY: {
      NAME: sale.customerName ?? "General Customer",
      "GST NUMBER": sale.buyerGstin ?? "",
      PHONE: sale.customerPhone ?? "",
    },
    PAYMENTMODE: sale.paymentMode,
    STOCKITEM: stockItems(sale.items),
    DETAIL: sale.items.map((li) => ({
      STOCKITEMNAME: li.name,
      HSNCODE: li.hsn ?? "",
      QTY: li.qty.toFixed(4),
      RATE: amt(li.unitPriceCents),
      GROSSAMT: amt(li.qty * li.unitPriceCents),
      DISCAMT: amt(li.discountCents),
      AFTERDISC: amt(li.lineNetCents),
      TAXPER: rate(li.gstRate),
      TAXAMT: amt(li.taxCents),
      CESSAMT: amt(0),
      NETAMT: amt(li.lineTotalCents),
    })),
    TOTALS: {
      SUBTOTAL: amt(sale.subtotalCents),
      DISCAMT: amt(sale.discountCents),
      "TOTAL TAXAMT": amt(sale.taxCents),
      ROUNDOFF: amt(sale.roundOffCents),
      NETAMT: amt(sale.totalCents),
    },
  };

  await enqueue(tx, {
    orgId,
    branchId: sale.branchId,
    eventType: "SALE",
    entityId: sale.id,
    externalRef: payload.REF,
    payload,
    occurredAt: sale.createdAt,
  });
}

/// Units brought back against a bill. Becomes a Credit Note in Tally, carrying
/// a reference to the invoice it reverses.
export async function emitSaleReturn(tx: Tx, orgId: string, returnId: string) {
  const ret = await tx.saleReturn.findFirst({
    where: { id: returnId, orgId },
    include: {
      items: { include: { saleItem: true } },
      sale: { select: { invoiceCode: true, origin: true, customerName: true, buyerGstin: true } },
      branch: { select: { name: true, invoicePrefix: true } },
    },
  });
  if (!ret || ret.sale.origin !== "SALON_OS") return;

  const lines = ret.items.map((ri) => ({
    productId: ri.productId,
    name: ri.saleItem.name,
    hsn: ri.saleItem.hsn,
    gstRate: ri.saleItem.gstRate,
    qty: ri.qty,
    lineNetCents: ri.lineNetCents,
    taxCents: ri.taxCents,
    lineTotalCents: ri.lineTotalCents,
    unitPriceCents: ri.saleItem.unitPriceCents,
  }));

  const payload = {
    REF: `SO-CRN-${ret.creditNoteCode}`,
    TYPE: "SALE_RETURN",
    TRANSDATE: toTallyDate(ret.createdAt),
    SABILLNO: ret.creditNoteCode,
    /// The invoice being credited — Tally needs the original to apply it.
    AGAINSTBILLNO: ret.sale.invoiceCode,
    REASON: ret.reason,
    BRANCH: { CODE: ret.branch.invoicePrefix ?? "", NAME: ret.branch.name },
    PARTY: {
      NAME: ret.sale.customerName ?? "General Customer",
      "GST NUMBER": ret.sale.buyerGstin ?? "",
    },
    REFUNDMODE: ret.refundMode,
    STOCKITEM: stockItems(lines),
    DETAIL: lines.map((li) => ({
      STOCKITEMNAME: li.name,
      HSNCODE: li.hsn ?? "",
      QTY: li.qty.toFixed(4),
      RATE: amt(li.unitPriceCents),
      AFTERDISC: amt(li.lineNetCents),
      TAXPER: rate(li.gstRate),
      TAXAMT: amt(li.taxCents),
      NETAMT: amt(li.lineTotalCents),
    })),
    TOTALS: {
      SUBTOTAL: amt(ret.subtotalCents),
      "TOTAL TAXAMT": amt(ret.taxCents),
      NETAMT: amt(ret.totalCents),
    },
  };

  await enqueue(tx, {
    orgId,
    branchId: ret.branchId,
    eventType: "SALE_RETURN",
    entityId: ret.id,
    externalRef: payload.REF,
    payload,
    occurredAt: ret.createdAt,
  });
}

/// A bill cancelled as an error. Tally may already hold the voucher, so this
/// is published as its own event rather than by deleting the SALE — you cannot
/// un-send something the connector has already imported.
export async function emitVoid(tx: Tx, orgId: string, saleId: string) {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, orgId },
    select: {
      id: true, branchId: true, invoiceCode: true, origin: true,
      voidReason: true, totalCents: true, updatedAt: true,
    },
  });
  if (!sale || sale.origin !== "SALON_OS") return;

  const payload = {
    REF: `SO-VOID-${sale.invoiceCode}`,
    TYPE: "VOID",
    TRANSDATE: toTallyDate(sale.updatedAt),
    /// The voucher to cancel in Tally.
    AGAINSTBILLNO: sale.invoiceCode,
    REASON: sale.voidReason ?? "",
    NETAMT: amt(sale.totalCents),
  };

  await enqueue(tx, {
    orgId,
    branchId: sale.branchId,
    eventType: "VOID",
    entityId: sale.id,
    externalRef: payload.REF,
    payload,
    occurredAt: sale.updatedAt,
  });
}
