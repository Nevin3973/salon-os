import Link from "next/link";
import { requireScopedSession } from "@/lib/tenant";
import { fmtDate, orderCode } from "@/lib/format";
import { formatMoney } from "@/lib/money";

/**
 * Every tax invoice the warehouse has raised on a branch, newest first.
 *
 * This is the outward-supply register: one row per dispatch, in an unbroken
 * number series per financial year. The accountant reconciles it against Tally,
 * so the totals shown here are the invoice's own snapshots rather than anything
 * recomputed from today's prices.
 */
export default async function WarehouseInvoicesPage() {
  const { db } = await requireScopedSession("WAREHOUSE_MANAGER");

  const invoices = await db.transferInvoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      branch: { select: { name: true } },
      order: { select: { orderNo: true } },
      _count: { select: { items: true } },
    },
  });

  const totalCents = invoices.reduce((s, i) => s + i.totalCents, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Transfer invoices</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed max-w-2xl">
          One tax invoice per delivery to a branch, raised automatically when you dispatch. Goods
          move at the purchase rate; the branch sells them on at MRP.
        </p>
        <div className="flex gap-3 mt-4 flex-wrap">
          <div className="glass-surface rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-xs text-faint font-medium uppercase tracking-wider">Invoices</span>
            <span className="text-sm font-bold text-ink tabular-nums">{invoices.length}</span>
          </div>
          <div className="glass-surface rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-xs text-faint font-medium uppercase tracking-wider">Value</span>
            <span className="text-sm font-bold text-ink tabular-nums">
              {formatMoney(totalCents)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-[10px] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-3">Invoice no.</th>
              <th className="font-medium px-4 py-3">Dated</th>
              <th className="font-medium px-4 py-3">Branch</th>
              <th className="font-medium px-4 py-3">Against order</th>
              <th className="font-medium px-4 py-3 text-right">Lines</th>
              <th className="font-medium px-4 py-3 text-right">Taxable</th>
              <th className="font-medium px-4 py-3 text-right">Tax</th>
              <th className="font-medium px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-line-soft row-hover">
                <td className="px-4 py-3">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="font-medium hover:text-velvet hover:underline"
                  >
                    {inv.invoiceNo}
                  </Link>
                </td>
                <td className="px-4 py-3 text-faint text-xs">{fmtDate(inv.createdAt)}</td>
                <td className="px-4 py-3 text-muted">{inv.branch.name}</td>
                <td className="px-4 py-3 text-muted tabular-nums">
                  {orderCode(inv.order.orderNo)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {inv._count.items}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatMoney(inv.subtotalCents)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {formatMoney(inv.taxCents)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatMoney(inv.totalCents)}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-faint">
                  No invoices yet. One is raised each time you dispatch against an order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
