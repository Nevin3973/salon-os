import { requireScopedSession } from "@/lib/tenant";
import { warehouseStockSummary } from "@/lib/stock-summary";
import { fmtDate } from "@/lib/format";

/// Stock Item Summary for the central warehouse — section 7 of the client's
/// requirements, the other half of the branch-level report.
///
/// Every column comes from the movement ledger, so closing can always be
/// explained by the rows above it.

function bounds(fromParam?: string, toParam?: string) {
  const now = new Date();
  const from = fromParam ? new Date(`${fromParam}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const toIncl = toParam ? new Date(`${toParam}T00:00:00`) : now;
  const to = new Date(toIncl.getFullYear(), toIncl.getMonth(), toIncl.getDate() + 1);
  return { from, to, toIncl };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function WarehouseStockSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { session } = await requireScopedSession("WAREHOUSE_MANAGER");
  const { from: fromParam, to: toParam } = await searchParams;
  const { from, to, toIncl } = bounds(fromParam, toParam);

  const rows = await warehouseStockSummary(session.orgId, from, to);

  const totals = rows.reduce(
    (a, r) => ({
      opening: a.opening + r.opening,
      receivedBack: a.receivedBack + r.receivedBack,
      dispatched: a.dispatched + r.dispatched,
      writtenOff: a.writtenOff + r.writtenOff,
      adjustments: a.adjustments + r.adjustments,
      closing: a.closing + r.closing,
    }),
    { opening: 0, receivedBack: 0, dispatched: 0, writtenOff: 0, adjustments: 0, closing: 0 },
  );

  const num = (v: number) => (v === 0 ? <span className="text-muted">—</span> : v);

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Stock item summary</h1>
      <p className="text-muted text-sm mb-2">
        Warehouse movement between {fmtDate(from)} and {fmtDate(toIncl)}. Closing is opening plus
        everything in between, so any figure here traces back to the movements that produced it.
      </p>
      <p className="text-muted text-sm mb-5">
        Products with no movement in the ledger do not appear — there is nothing to derive an
        opening balance from. Purchases will show here once inward stock arrives from Tally; today
        imports are stock counts rather than receipts, so they are reported as adjustments.
      </p>

      <form method="GET" className="flex items-end gap-3 flex-wrap mb-6">
        <label className="text-sm">
          <span className="block text-muted mb-1">From</span>
          <input type="date" name="from" defaultValue={iso(from)} className="input" />
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">To</span>
          <input type="date" name="to" defaultValue={iso(toIncl)} className="input" />
        </label>
        <button type="submit" className="btn btn-primary">Show</button>
      </form>

      {rows.length === 0 ? (
        <p className="text-muted text-sm">No warehouse stock moved in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted text-left border-b border-line">
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="py-2 px-2 text-right font-medium">Opening</th>
                <th className="py-2 px-2 text-right font-medium">Received back</th>
                <th className="py-2 px-2 text-right font-medium">Dispatched</th>
                <th className="py-2 px-2 text-right font-medium">Written off</th>
                <th className="py-2 px-2 text-right font-medium">Adjustments</th>
                <th className="py-2 pl-2 text-right font-medium">Closing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-b border-line/60">
                  <td className="py-2 pr-4">
                    <span className="block">{r.name}</span>
                    <span className="text-muted text-xs">{r.sku}</span>
                  </td>
                  <td className="py-2 px-2 text-right">{num(r.opening)}</td>
                  <td className="py-2 px-2 text-right">{num(r.receivedBack)}</td>
                  <td className="py-2 px-2 text-right">{num(r.dispatched)}</td>
                  <td className="py-2 px-2 text-right">{num(r.writtenOff)}</td>
                  <td className="py-2 px-2 text-right">{num(r.adjustments)}</td>
                  <td className="py-2 pl-2 text-right font-medium">{r.closing}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-medium">
                <td className="py-2 pr-4">{rows.length} products</td>
                <td className="py-2 px-2 text-right">{totals.opening}</td>
                <td className="py-2 px-2 text-right">{totals.receivedBack}</td>
                <td className="py-2 px-2 text-right">{totals.dispatched}</td>
                <td className="py-2 px-2 text-right">{totals.writtenOff}</td>
                <td className="py-2 px-2 text-right">{totals.adjustments}</td>
                <td className="py-2 pl-2 text-right">{totals.closing}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
