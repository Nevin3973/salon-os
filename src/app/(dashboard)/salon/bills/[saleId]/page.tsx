import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireScopedSession, activeOrgName } from "@/lib/tenant";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { lineGst, gstBreakdown } from "@/lib/gst";
import { PAYMENT_MODE_LABEL, type PaymentModeValue } from "@/lib/constants";
import { InvoiceActions } from "./invoice-actions";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { session, db } = await requireScopedSession(["PURCHASE_MANAGER", "SALON_STAFF"]);
  const { saleId } = await params;
  const { new: isNew } = await searchParams;
  const isManager = session.role === "PURCHASE_MANAGER";

  const sale = await db.sale.findFirst({
    // A cashier can only open a bill they raised themselves.
    where: {
      id: saleId,
      branchId: session.locationId ?? undefined,
      ...(isManager ? {} : { soldByUserId: session.userId }),
    },
    include: {
      items: true,
      branch: { select: { name: true } },
      returns: { include: { items: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!sale) notFound();

  const [org, seller, address, orgName] = await Promise.all([
    prisma.org.findUnique({ where: { id: session.orgId }, select: { name: true, legalName: true, gstin: true } }),
    prisma.user.findUnique({ where: { id: sale.soldByUserId }, select: { name: true } }),
    db.address.findFirst({ where: { locationId: sale.branchId, isDefault: true } }),
    activeOrgName(),
  ]);

  const sellerName = org?.legalName || org?.name || orgName;
  const voided = sale.status === "VOID";
  const returnable = sale.items.some((it) => it.qty > it.returnedQty);
  const breakdown = gstBreakdown(
    sale.items.map((it) => ({
      unitPriceCents: it.unitPriceCents,
      qty: it.qty,
      gstRate: it.gstRate,
      discountCents: it.discountCents,
    }))
  );
  const addressLine = address
    ? [address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(", ")
    : null;

  return (
    <div className="max-w-3xl">
      <div className="no-print flex items-center justify-between gap-3 mb-4">
        <Link href="/salon/bills" className="text-sm text-muted hover:text-ink">← All bills</Link>
        <InvoiceActions
          saleId={sale.id}
          canVoid={isManager && sale.status === "COMPLETED"}
          canReturn={isManager && !voided && returnable}
          lines={sale.items.map((it) => ({
            saleItemId: it.id,
            name: it.name,
            qty: it.qty,
            returnedQty: it.returnedQty,
          }))}
        />
      </div>

      {isNew && !voided && (
        <div className="no-print mb-4 flex items-center gap-3 bg-velvet-soft border border-velvet/20 rounded-xl px-4 py-3 text-sm">
          <span className="w-7 h-7 rounded-full bg-velvet text-on-velvet grid place-items-center shrink-0">✓</span>
          <span>Sale complete. The stock has been taken off your shelf.</span>
        </div>
      )}

      {/* The printable invoice */}
      <div className="print-block bg-surface border border-line rounded-xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* On a roll these stack full-width and centre, the way a till receipt
              conventionally reads. On A4 they stay as a two-column letterhead. */}
          <div className="receipt-center">
            <div className="font-display text-xl font-bold">{sellerName}</div>
            <div className="text-xs text-muted mt-1">{sale.branch.name}</div>
            {addressLine && <div className="text-xs text-faint mt-0.5 max-w-xs">{addressLine}</div>}
            {org?.gstin && <div className="text-xs text-faint mt-0.5">GSTIN: {org.gstin}</div>}
          </div>
          <div className="receipt-center text-right">
            <div className="text-[11px] uppercase tracking-[0.18em] text-faint font-semibold">Tax Invoice</div>
            <div className="font-semibold text-lg mt-0.5">{sale.invoiceCode}</div>
            <div className="text-xs text-faint mt-0.5">{fmtDateTime(sale.createdAt)}</div>
            {voided && <div className="text-out font-bold text-sm mt-1">VOID</div>}
          </div>
        </div>

        {(sale.customerName || sale.customerPhone || sale.buyerGstin) && (
          <div className="mt-5 text-sm">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-0.5">Billed to</div>
            <div className="text-ink">{sale.customerName || "Walk-in customer"}</div>
            {sale.customerPhone && <div className="text-muted text-xs">{sale.customerPhone}</div>}
            {sale.buyerGstin && <div className="text-muted text-xs">GSTIN: {sale.buyerGstin}</div>}
          </div>
        )}

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
                {/* On a 58/80mm roll only Item, Qty and Amount fit; the rest
                    are `a4-only` and drop out of the receipt layout. */}
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="a4-only py-2 px-2 font-medium">HSN</th>
                <th className="py-2 px-2 font-medium text-right">Qty</th>
                <th className="a4-only py-2 px-2 font-medium text-right">Rate</th>
                <th className="a4-only py-2 px-2 font-medium text-right">Disc.</th>
                <th className="a4-only py-2 px-2 font-medium text-right">Taxable</th>
                <th className="a4-only py-2 px-2 font-medium text-right">GST</th>
                <th className="py-2 pl-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((it) => {
                const g = lineGst(it.unitPriceCents, it.qty, it.gstRate, it.discountCents);
                return (
                  <tr key={it.id} className="border-b border-line-soft">
                    <td className="py-2 pr-2">
                      {it.name}
                      {it.returnedQty > 0 && (
                        <span className="text-out text-xs"> · {it.returnedQty} returned</span>
                      )}
                    </td>
                    <td className="a4-only py-2 px-2 text-faint text-xs">{it.hsn ?? "—"}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{it.qty}</td>
                    <td className="a4-only py-2 px-2 text-right tabular-nums">{formatMoney(it.unitPriceCents)}</td>
                    <td className="a4-only py-2 px-2 text-right tabular-nums">
                      {it.discountCents > 0 ? formatMoney(it.discountCents) : <span className="text-faint">—</span>}
                    </td>
                    <td className="a4-only py-2 px-2 text-right tabular-nums">{formatMoney(g.netCents)}</td>
                    <td className="a4-only py-2 px-2 text-right tabular-nums">
                      {formatMoney(g.taxCents)}
                      <span className="text-faint text-xs"> ({it.gstRate}%)</span>
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums font-medium">{formatMoney(g.totalCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between gap-5 mt-5">
          {/* GST summary by rate — intra-state, split CGST + SGST. Four numeric
              columns will not fit a roll, and the customer copy does not need
              them; the totals below carry the tax figure that matters. */}
          <div className="a4-only text-xs">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">GST summary</div>
            <table className="border-collapse">
              <thead>
                <tr className="text-faint text-left">
                  <th className="pr-4 font-medium py-0.5">Rate</th>
                  <th className="pr-4 font-medium py-0.5 text-right">Taxable</th>
                  <th className="pr-4 font-medium py-0.5 text-right">CGST</th>
                  <th className="font-medium py-0.5 text-right">SGST</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {breakdown.map((b) => (
                  <tr key={b.rate}>
                    <td className="pr-4 py-0.5">{b.rate}%</td>
                    <td className="pr-4 py-0.5 text-right">{formatMoney(b.taxableCents)}</td>
                    <td className="pr-4 py-0.5 text-right">{formatMoney(b.cgstCents)}</td>
                    <td className="py-0.5 text-right">{formatMoney(b.sgstCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:w-64 space-y-1.5 text-sm">
            {sale.discountCents > 0 && (
              <div className="flex justify-between text-muted">
                <span>Discount</span>
                <span className="tabular-nums">− {formatMoney(sale.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted">
              <span>Taxable value</span>
              <span className="tabular-nums">{formatMoney(sale.subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Total GST</span>
              <span className="tabular-nums">{formatMoney(sale.taxCents)}</span>
            </div>
            {sale.roundOffCents !== 0 && (
              <div className="flex justify-between text-muted">
                <span>Round off</span>
                <span className="tabular-nums">
                  {sale.roundOffCents > 0 ? "+" : "−"} {formatMoney(Math.abs(sale.roundOffCents))}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base border-t border-line pt-1.5">
              <span>Grand total</span>
              <span className="tabular-nums">{formatMoney(sale.totalCents)}</span>
            </div>
            <div className="flex justify-between text-xs text-faint pt-1">
              <span>Paid by</span>
              <span>{PAYMENT_MODE_LABEL[sale.paymentMode as PaymentModeValue]}</span>
            </div>
          </div>
        </div>

        {voided && sale.voidReason && (
          <div className="mt-5 text-xs text-out border-t border-line pt-3">
            This bill was voided — {sale.voidReason}. The stock was returned to the shelf.
          </div>
        )}

        {sale.returns.length > 0 && (
          <div className="mt-5 border-t border-line pt-3">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
              Credit notes against this invoice
            </div>
            <div className="space-y-1 text-xs">
              {sale.returns.map((r) => (
                <div key={r.id} className="flex justify-between gap-3 text-muted">
                  <span>
                    <span className="font-medium text-ink">{r.creditNoteCode}</span> · {fmtDateTime(r.createdAt)} ·{" "}
                    {r.items.reduce((s, i) => s + i.qty, 0)} unit
                    {r.items.reduce((s, i) => s + i.qty, 0) === 1 ? "" : "s"} · {r.reason}
                  </span>
                  <span className="tabular-nums whitespace-nowrap">− {formatMoney(r.totalCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="receipt-center text-[11px] text-faint mt-6 pt-4 border-t border-line">
          Sold by {seller?.name ?? "—"} · {sellerName} · Powered by Salon OS from Beyond Demands
        </div>
      </div>
    </div>
  );
}
