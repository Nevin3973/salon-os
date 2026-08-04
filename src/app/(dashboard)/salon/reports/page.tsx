import { requireScopedSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { salesSummary, parseRange } from "@/lib/reports";
import { PageHeader, StatGrid, ExportButton } from "@/components/console-ui";
import { ReportControls } from "./report-controls";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function SalonReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { session } = await requireScopedSession("PURCHASE_MANAGER");
  const { from, to } = await searchParams;

  // Default window: the last 30 days.
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);

  const range = parseRange(from ?? iso(start), to ?? iso(end));
  const fromStr = iso(range.from ?? start);
  const toStr = iso(range.to ?? end);
  const qs = `from=${fromStr}&to=${toStr}`;

  const summary = await salesSummary({ orgId: session.orgId, branchId: session.locationId ?? null }, range);
  const { totals, days, payments, topProducts } = summary;
  const peak = Math.max(1, ...days.map((d) => d.revenueCents));

  return (
    <div>
      <PageHeader
        title="Sales report"
        subtitle="What this branch has sold to customers. Pick a window, then print it or pull the raw rows as CSV."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton href={`/api/exports/sales?${qs}`} label="Sales CSV" tone="primary" />
            <ExportButton href={`/api/exports/hsn?${qs}`} label="HSN summary" />
            <ExportButton href={`/api/exports/tally?${qs}`} label="Tally XML" />
          </div>
        }
      />

      <div className="mb-5">
        <ReportControls from={fromStr} to={toStr} />
      </div>

      <p className="text-sm text-muted mb-4">
        <span className="text-faint">Period:</span>{" "}
        <span className="text-ink font-medium">{fmtDate(range.from)} — {fmtDate(range.to)}</span>
      </p>

      <StatGrid
        stats={[
          { label: "Bills", value: totals.bills },
          { label: "Revenue", value: formatMoney(totals.grossCents), tone: "accent" },
          { label: "Taxable value", value: formatMoney(totals.netCents) },
          { label: "GST collected", value: formatMoney(totals.taxCents) },
          { label: "Gross margin", value: formatMoney(totals.marginCents), tone: "in" },
          { label: "Units sold", value: totals.units },
        ]}
      />

      {(totals.voided > 0 || totals.returnedCents > 0) && (
        <p className="text-xs text-faint -mt-2 mb-5">
          {totals.voided > 0 && (
            <>Excluded: {totals.voided} voided bill{totals.voided === 1 ? "" : "s"}. </>
          )}
          {totals.returnedCents > 0 && (
            <>Figures are net of {formatMoney(totals.returnedCents)} credited back on returns.</>
          )}
        </p>
      )}

      {/* Day by day */}
      <section className="print-block bg-surface border border-line rounded-[10px] overflow-x-auto mb-5">
        <h2 className="text-sm font-semibold px-4 pt-4 pb-3">Day by day</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-2.5">Date</th>
              <th className="font-medium px-4 py-2.5 text-right">Bills</th>
              <th className="font-medium px-4 py-2.5 text-right">Revenue</th>
              <th className="font-medium px-4 py-2.5 w-40">Trend</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.key} className="border-t border-line-soft">
                <td className="px-4 py-2.5 whitespace-nowrap text-ink">{fmtDate(d.key)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{d.bills}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink font-medium whitespace-nowrap">
                  {formatMoney(d.revenueCents)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="h-2 rounded-full bg-line-soft overflow-hidden">
                    <div className="h-full bg-velvet rounded-full" style={{ width: `${Math.round((d.revenueCents / peak) * 100)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            {days.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-faint">No sales in this period.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top products */}
        <section className="print-block bg-surface border border-line rounded-[10px] overflow-x-auto">
          <h2 className="text-sm font-semibold px-4 pt-4 pb-3">Best sellers</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                <th className="font-medium px-4 py-2.5">Product</th>
                <th className="font-medium px-4 py-2.5 text-right">Units</th>
                <th className="font-medium px-4 py-2.5 text-right">Revenue</th>
                <th className="font-medium px-4 py-2.5 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.name} className="border-t border-line-soft">
                  <td className="px-4 py-2.5 text-ink">{p.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{p.units}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink font-medium whitespace-nowrap">{formatMoney(p.revenueCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-in whitespace-nowrap">{formatMoney(p.marginCents)}</td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-faint">Nothing sold in this period.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Payment mix */}
        <section className="print-block bg-surface border border-line rounded-[10px] overflow-x-auto">
          <h2 className="text-sm font-semibold px-4 pt-4 pb-3">How customers paid</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                <th className="font-medium px-4 py-2.5">Method</th>
                <th className="font-medium px-4 py-2.5 text-right">Bills</th>
                <th className="font-medium px-4 py-2.5 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.mode} className="border-t border-line-soft">
                  <td className="px-4 py-2.5 text-ink">{p.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{p.bills}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink font-medium whitespace-nowrap">{formatMoney(p.revenueCents)}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-faint">No sales in this period.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
