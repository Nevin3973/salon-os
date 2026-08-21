import type { Prisma } from "@prisma/client";
import { amt, rate, toTallyDate } from "./format";
import { orderCode } from "@/lib/format";

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

/// Stock moving from the central warehouse to a salon, against an approved
/// request. The largest value flowing through the business, and the flow the
/// platform exists to track.
///
/// The Tally voucher this becomes is still open: an internal stock transfer if
/// the salons are branches of one legal entity, or a sales invoice if they are
/// separate companies. The payload therefore carries everything BOTH readings
/// need -- quantities, the branch, and the transfer value at purchase rate --
/// and leaves the voucher choice to the connector.
///
/// Valued at the PURCHASE rate, per the client's pricing rule: goods supplied
/// to a salon move at cost, and only the salon's own retail sale is at MRP.
export async function emitAllocation(
  tx: Tx,
  orgId: string,
  orderId: string,
  dispatched: Array<{ productId: string; qty: number }>,
) {
  if (!dispatched.length) return;

  const order = await tx.order.findFirst({
    where: { id: orderId, orgId },
    include: {
      items: { include: { product: { select: { name: true, hsn: true, gstRate: true, sku: true } } } },
      branch: { select: { name: true, invoicePrefix: true } },
    },
  });
  if (!order || order.origin !== "SALON_OS") return;

  const byProduct = new Map(order.items.map((it) => [it.productId, it]));
  const lines = dispatched
    .map((d) => ({ d, it: byProduct.get(d.productId) }))
    .filter((x): x is { d: { productId: string; qty: number }; it: NonNullable<typeof x.it> } => Boolean(x.it))
    .map(({ d, it }) => ({
      productId: d.productId,
      qty: d.qty,
      name: it.product.name,
      sku: it.product.sku,
      hsn: it.product.hsn,
      gstRate: it.product.gstRate,
      unitPriceCents: it.unitPriceCents,
    }));
  if (!lines.length) return;

  // An order can be dispatched in several passes. Counting deliveries already
  // recorded gives a value that strictly increases per pass, so each pass gets
  // its own voucher reference and a replay of one pass cannot collide with
  // another. Called after the delivery rows are written, so this pass counts.
  const deliveries = await tx.orderItemDelivery.count({
    where: { orderItem: { orderId: order.id }, kind: "DISPATCH" },
  });

  const now = new Date();
  const payload = {
    REF: `SO-ALLOC-${orderCode(order.orderNo)}-D${deliveries}`,
    TYPE: "ALLOCATION",
    TRANSDATE: toTallyDate(now),
    ORDERNO: orderCode(order.orderNo),
    /// Receiving salon. Whether this is a godown, a cost centre or a separate
    /// company in Tally is the partner's mapping decision.
    TOBRANCH: { CODE: order.branch.invoicePrefix ?? "", NAME: order.branch.name },
    STOCKITEM: stockItems(lines),
    DETAIL: lines.map((li) => ({
      STOCKITEMNAME: li.name,
      PRDCODE: li.sku,
      HSNCODE: li.hsn ?? "",
      QTY: li.qty.toFixed(4),
      RATE: amt(li.unitPriceCents),
      NETAMT: amt(li.qty * li.unitPriceCents),
      TAXPER: rate(li.gstRate),
    })),
    TOTALS: {
      NETAMT: amt(lines.reduce((s, li) => s + li.qty * li.unitPriceCents, 0)),
    },
  };

  await enqueue(tx, {
    orgId,
    branchId: order.branchId,
    eventType: "ALLOCATION",
    entityId: order.id,
    externalRef: payload.REF,
    payload,
    occurredAt: now,
  });
}

/// Stock going back from a salon to the warehouse -- damaged, over-delivered,
/// or no longer needed. The reverse of an allocation, and valued the same way.
export async function emitBranchReturn(
  tx: Tx,
  orgId: string,
  orderId: string,
  returned: Array<{ productId: string; qty: number }>,
  reason: string,
) {
  if (!returned.length) return;

  const order = await tx.order.findFirst({
    where: { id: orderId, orgId },
    include: {
      items: { include: { product: { select: { name: true, hsn: true, gstRate: true, sku: true } } } },
      branch: { select: { name: true, invoicePrefix: true } },
    },
  });
  if (!order || order.origin !== "SALON_OS") return;

  const byProduct = new Map(order.items.map((it) => [it.productId, it]));
  const lines = returned
    .map((r) => ({ r, it: byProduct.get(r.productId) }))
    .filter((x): x is { r: { productId: string; qty: number }; it: NonNullable<typeof x.it> } => Boolean(x.it))
    .map(({ r, it }) => ({
      productId: r.productId,
      qty: r.qty,
      name: it.product.name,
      sku: it.product.sku,
      hsn: it.product.hsn,
      gstRate: it.product.gstRate,
      unitPriceCents: it.unitPriceCents,
    }));
  if (!lines.length) return;

  const returns = await tx.orderItemDelivery.count({
    where: { orderItem: { orderId: order.id }, kind: "RETURN" },
  });

  const now = new Date();
  const payload = {
    REF: `SO-BRET-${orderCode(order.orderNo)}-R${returns}`,
    TYPE: "BRANCH_RETURN",
    TRANSDATE: toTallyDate(now),
    ORDERNO: orderCode(order.orderNo),
    REASON: reason,
    FROMBRANCH: { CODE: order.branch.invoicePrefix ?? "", NAME: order.branch.name },
    STOCKITEM: stockItems(lines),
    DETAIL: lines.map((li) => ({
      STOCKITEMNAME: li.name,
      PRDCODE: li.sku,
      HSNCODE: li.hsn ?? "",
      QTY: li.qty.toFixed(4),
      RATE: amt(li.unitPriceCents),
      NETAMT: amt(li.qty * li.unitPriceCents),
      TAXPER: rate(li.gstRate),
    })),
    TOTALS: {
      NETAMT: amt(lines.reduce((s, li) => s + li.qty * li.unitPriceCents, 0)),
    },
  };

  await enqueue(tx, {
    orgId,
    branchId: order.branchId,
    eventType: "BRANCH_RETURN",
    entityId: order.id,
    externalRef: payload.REF,
    payload,
    occurredAt: now,
  });
}

/// Stock disposed of — expired, damaged, or otherwise unsellable.
///
/// A stock journal in Tally, not a sale: nothing was received for these units,
/// so the value leaves the books as a loss rather than as revenue. Valued at
/// the purchase rate, which is what the loss actually cost.
export async function emitWriteOff(
  tx: Tx,
  orgId: string,
  batchId: string,
  qty: number,
  reason: string,
) {
  if (qty <= 0) return;

  const batch = await tx.productBatch.findFirst({
    where: { id: batchId, orgId },
    include: {
      product: { select: { name: true, sku: true, hsn: true, gstRate: true, priceCents: true } },
      branch: { select: { name: true, invoicePrefix: true } },
    },
  });
  if (!batch) return;

  const now = new Date();
  const value = qty * batch.product.priceCents;
  const payload = {
    // The batch and quantity together identify the disposal: writing off part
    // of a lot twice is a real thing that happens, so the reference cannot be
    // the batch alone.
    REF: `SO-WOFF-${batch.id}-${qty}-${now.getTime()}`,
    TYPE: "WRITE_OFF",
    TRANSDATE: toTallyDate(now),
    BATCHNO: batch.batchNo,
    EXPIRYDATE: toTallyDate(batch.expiryDate),
    REASON: reason,
    /// Null branch means the central warehouse.
    LOCATION: batch.branch
      ? { CODE: batch.branch.invoicePrefix ?? "", NAME: batch.branch.name }
      : { CODE: "WH", NAME: "Central warehouse" },
    STOCKITEM: stockItems([
      {
        productId: batch.productId,
        name: batch.product.name,
        hsn: batch.product.hsn,
        gstRate: batch.product.gstRate,
      },
    ]),
    DETAIL: [
      {
        STOCKITEMNAME: batch.product.name,
        PRDCODE: batch.product.sku,
        HSNCODE: batch.product.hsn ?? "",
        QTY: qty.toFixed(4),
        RATE: amt(batch.product.priceCents),
        NETAMT: amt(value),
      },
    ],
    TOTALS: { NETAMT: amt(value) },
  };

  await enqueue(tx, {
    orgId,
    branchId: batch.branchId,
    eventType: "WRITE_OFF",
    entityId: batch.id,
    externalRef: payload.REF,
    payload,
    occurredAt: now,
  });
}
