import { requireScopedSession } from "@/lib/tenant";
import { branchStockSummary } from "@/lib/stock-summary";
import { fmtDate } from "@/lib/format";

/// Stock Item Summary — section 7 of the client's requirements.
///
/// Every column is derived from the movement ledger, so the closing figure can
/// always be explained by the rows above it. Opening + inward − outward −
/// salon use + returns − sent back + adjustments reconciles by construction.

function monthBounds(fromParam?: string, toParam?: string) {
  const now = new Date();
  const from = fromParam ? new Date(`${fromParam}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  // `to` is inclusive for the reader, exclusive for the query.
  const toIncl = toParam ? new Date(`${toParam}T00:00:00`) : now;
  const to = new Date(toIncl.getFullYear(), toIncl.getMonth(), toIncl.getDate() + 1);
  return { from, to, toIncl };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function StockSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { session } = await requireScopedSession("PURCHASE_MANAGER");
  const { from: fromParam, to: toParam } = await searchParams;
  const { from, to, toIncl } = monthBounds(fromParam, toParam);

  const branchId = session.locationId;
  const rows = branchId ? await branchStockSummary(session.orgId, branchId, from, to) : [];

  const totals = rows.reduce(
    (acc, r) => ({
      opening: acc.opening + r.opening,
      inward: acc.inward + r.inward,
      outward: acc.outward + r.outward,
      salonUse: acc.salonUse + r.salonUse,
      returns: acc.returns + r.returns,
      toWarehouse: acc.toWarehouse + r.toWarehouse,
      adjustments: acc.adjustments + r.adjustments,
      closing: acc.closing + r.closing,
    }),
    { opening: 0, inward: 0, outward: 0, salonUse: 0, returns: 0, toWarehouse: 0, adjustments: 0, closing: 0 },
  );

  const num = (v: number) => (v === 0 ? <span className="text-muted">—</span> : v);

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Stock item summary</h1>
      <p className="text-muted text-sm mb-5">
        Every movement for your branch between {fmtDate(from)} and {fmtDate(toIncl)}. Closing is
        opening plus everything that happened in between, so any figure here can be traced back to
        the movements that produced it.
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

      {!branchId ? (
        <p className="text-muted text-sm">Your account is not assigned to a branch.</p>
      ) : rows.length === 0 ? (
        <p className="text-muted text-sm">No stock moved at your branch in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted text-left border-b border-line">
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="py-2 px-2 text-right font-medium">Opening</th>
                <th className="py-2 px-2 text-right font-medium">Inward</th>
                <th className="py-2 px-2 text-right font-medium">Sold</th>
                <th className="py-2 px-2 text-right font-medium">Salon use</th>
                <th className="py-2 px-2 text-right font-medium">Returns</th>
                <th className="py-2 px-2 text-right font-medium">To warehouse</th>
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
                  <td className="py-2 px-2 text-right">{num(r.inward)}</td>
                  <td className="py-2 px-2 text-right">{num(r.outward)}</td>
                  <td className="py-2 px-2 text-right">{num(r.salonUse)}</td>
                  <td className="py-2 px-2 text-right">{num(r.returns)}</td>
                  <td className="py-2 px-2 text-right">{num(r.toWarehouse)}</td>
                  <td className="py-2 px-2 text-right">{num(r.adjustments)}</td>
                  <td className="py-2 pl-2 text-right font-medium">{r.closing}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-medium">
                <td className="py-2 pr-4">{rows.length} products</td>
                <td className="py-2 px-2 text-right">{totals.opening}</td>
                <td className="py-2 px-2 text-right">{totals.inward}</td>
                <td className="py-2 px-2 text-right">{totals.outward}</td>
                <td className="py-2 px-2 text-right">{totals.salonUse}</td>
                <td className="py-2 px-2 text-right">{totals.returns}</td>
                <td className="py-2 px-2 text-right">{totals.toWarehouse}</td>
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
