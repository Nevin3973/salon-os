import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireScopedSession } from "@/lib/tenant";
import { fmtDate, orderCode } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { amountInWords } from "@/lib/words";
import { PrintButton } from "@/components/print-button";

/**
 * The tax invoice the warehouse raises on a branch, laid out to match the
 * document the client's accountant already produces in Tally — same columns,
 * same HSN summary, same amount-in-words lines — so the two can be compared
 * side by side without translation.
 *
 * Readable by the warehouse that issued it and by the branch it bills. The
 * branch is the buyer named on the document; withholding its own invoice from
 * it would make the goods-received check impossible.
 */
export default async function TransferInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { session, db } = await requireScopedSession([
    "WAREHOUSE_MANAGER",
    "PURCHASE_MANAGER",
    "SUPER_ADMIN",
  ]);
  const { invoiceId } = await params;

  const invoice = await db.transferInvoice.findFirst({
    where: {
      id: invoiceId,
      // A branch manager may open only their own branch's invoices.
      ...(session.role === "PURCHASE_MANAGER" ? { branchId: session.locationId ?? undefined } : {}),
    },
    include: {
      items: { orderBy: { name: "asc" } },
      branch: { select: { name: true } },
      order: { select: { orderNo: true, shipToAddress: true } },
    },
  });
  if (!invoice) notFound();

  const org = await prisma.org.findUnique({
    where: { id: session.orgId },
    select: { name: true, legalName: true, gstin: true, registeredAddress: true },
  });

  const sellerName = org?.legalName || org?.name || "";
  const sellerAddress = org?.registeredAddress?.trim() || null;

  const shipTo = invoice.order.shipToAddress;
  const shipToLine = shipTo
    ? [shipTo.line1, shipTo.line2, shipTo.city, shipTo.state, shipTo.postalCode]
        .filter(Boolean)
        .join(", ")
    : null;

  // HSN summary, the way GSTR-1 wants it: one row per HSN and rate.
  const hsnRows = new Map<
    string,
    { hsn: string; rate: number; taxableCents: number; cgstCents: number; sgstCents: number }
  >();
  for (const it of invoice.items) {
    const code = it.hsn?.trim() || "—";
    const key = `${code}|${it.gstRate}`;
    const row = hsnRows.get(key) ?? {
      hsn: code,
      rate: it.gstRate,
      taxableCents: 0,
      cgstCents: 0,
      sgstCents: 0,
    };
    row.taxableCents += it.taxableCents;
    row.cgstCents += it.cgstCents;
    row.sgstCents += it.sgstCents;
    hsnRows.set(key, row);
  }
  const hsnSummary = [...hsnRows.values()].sort((a, b) => a.hsn.localeCompare(b.hsn));
  const totalUnits = invoice.items.reduce((s, it) => s + it.qty, 0);
  const cgstTotal = invoice.items.reduce((s, it) => s + it.cgstCents, 0);
  const sgstTotal = invoice.items.reduce((s, it) => s + it.sgstCents, 0);
  const backHref =
    session.role === "PURCHASE_MANAGER"
      ? "/purchase-manager/orders"
      : session.role === "SUPER_ADMIN"
        ? "/admin"
        : "/warehouse/queue";

  return (
    <div className="max-w-4xl">
      <div className="no-print flex items-center justify-between gap-3 mb-4">
        <Link href={backHref} className="text-sm text-muted hover:text-ink">
          &larr; Back
        </Link>
        <PrintButton />
      </div>

      <div className="print-block bg-surface border border-line rounded-xl p-6 sm:p-8">
        <div className="text-center text-sm font-semibold tracking-wide mb-5">Tax Invoice</div>

        <div className="grid sm:grid-cols-2 gap-5 border-b border-line pb-5">
          <div>
            <div className="font-semibold text-[15px]">{sellerName}</div>
            {sellerAddress && (
              <div className="text-xs text-muted mt-1 whitespace-pre-line">{sellerAddress}</div>
            )}
            {org?.gstin && <div className="text-xs text-muted mt-0.5">GSTIN/UIN: {org.gstin}</div>}

            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wider text-faint">
                Consignee (Ship to)
              </div>
              <div className="font-semibold text-sm mt-0.5">{invoice.branch.name}</div>
              {shipToLine && <div className="text-xs text-muted mt-0.5">{shipToLine}</div>}
            </div>
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wider text-faint">Buyer (Bill to)</div>
              <div className="font-semibold text-sm mt-0.5">{invoice.branch.name}</div>
            </div>
          </div>

          <div className="text-sm">
            <Field label="Invoice No." value={invoice.invoiceNo} strong />
            <Field label="Dated" value={fmtDate(invoice.createdAt)} strong />
            <Field label="Buyer&rsquo;s Order No." value={orderCode(invoice.order.orderNo)} />
            <Field label="Mode/Terms of Payment" value="Inter-branch transfer" />
            <Field label="Terms of Delivery" value="Ex-warehouse" />
          </div>
        </div>

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
                <th className="py-2 pr-2 font-medium">Sl</th>
                <th className="py-2 px-2 font-medium">Description of Goods</th>
                <th className="py-2 px-2 font-medium">HSN/SAC</th>
                <th className="py-2 px-2 font-medium text-right">Quantity</th>
                <th className="py-2 px-2 font-medium text-right">Rate</th>
                <th className="py-2 px-2 font-medium">per</th>
                <th className="py-2 pl-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={it.id} className="border-b border-line-soft">
                  <td className="py-2 pr-2 text-faint tabular-nums">{i + 1}</td>
                  <td className="py-2 px-2 font-medium">{it.name}</td>
                  <td className="py-2 px-2 text-muted tabular-nums">{it.hsn || "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold">{it.qty}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatMoney(it.rateCents)}</td>
                  <td className="py-2 px-2 text-muted">{it.unit}</td>
                  <td className="py-2 pl-2 text-right tabular-nums font-semibold">
                    {formatMoney(it.taxableCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 ml-auto max-w-xs text-sm space-y-1.5">
          <Row label="Taxable value" value={formatMoney(invoice.subtotalCents)} />
          <Row label="CGST" value={formatMoney(cgstTotal)} />
          <Row label="SGST" value={formatMoney(sgstTotal)} />
          {invoice.roundOffCents !== 0 && (
            <Row label="Round off" value={formatMoney(invoice.roundOffCents)} />
          )}
          <div className="flex justify-between items-baseline border-t border-line pt-2 mt-2">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(invoice.totalCents)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-faint">
            <span>Total quantity</span>
            <span className="tabular-nums">{totalUnits}</span>
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4 text-sm">
          <div className="text-[11px] uppercase tracking-wider text-faint">
            Amount chargeable (in words)
          </div>
          <div className="font-semibold mt-0.5">{amountInWords(invoice.totalCents)}</div>
        </div>

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left uppercase tracking-wider text-faint border-y border-line">
                <th className="py-2 pr-2 font-medium">HSN/SAC</th>
                <th className="py-2 px-2 font-medium text-right">Taxable value</th>
                <th className="py-2 px-2 font-medium text-right">CGST rate</th>
                <th className="py-2 px-2 font-medium text-right">CGST amount</th>
                <th className="py-2 px-2 font-medium text-right">SGST rate</th>
                <th className="py-2 px-2 font-medium text-right">SGST amount</th>
                <th className="py-2 pl-2 font-medium text-right">Total tax</th>
              </tr>
            </thead>
            <tbody>
              {hsnSummary.map((h) => (
                <tr key={`${h.hsn}-${h.rate}`} className="border-b border-line-soft">
                  <td className="py-2 pr-2 tabular-nums">{h.hsn}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatMoney(h.taxableCents)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{h.rate / 2}%</td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatMoney(h.cgstCents)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{h.rate / 2}%</td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatMoney(h.sgstCents)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums font-semibold">
                    {formatMoney(h.cgstCents + h.sgstCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-sm">
          <span className="text-[11px] uppercase tracking-wider text-faint">
            Tax amount (in words):{" "}
          </span>
          <span className="font-medium">{amountInWords(invoice.taxCents)}</span>
        </div>

        <div className="mt-8 flex justify-between items-end gap-4 text-xs">
          <span className="text-faint">E. &amp; O.E</span>
          <div className="text-right">
            <div className="text-muted">for {sellerName}</div>
            <div className="mt-8 border-t border-line pt-1 text-faint">Authorised Signatory</div>
          </div>
        </div>

        <div className="text-center text-[11px] text-faint mt-6">
          This is a Computer Generated Document
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line-soft py-1.5">
      <span className="text-[11px] uppercase tracking-wider text-faint">{label}</span>
      <span className={strong ? "font-semibold" : "text-muted"}>{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
