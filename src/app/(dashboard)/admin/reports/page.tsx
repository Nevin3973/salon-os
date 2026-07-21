import { requireSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { monthlySummary, parseRange, lastMonths } from "@/lib/reports";
import { PageHeader, StatGrid, ExportButton } from "@/components/console-ui";
import { ReportControls } from "./report-controls";

/**
 * Head-office reporting: a monthly summary on screen, CSV downloads for the
 * raw data, and a print stylesheet so "Save as PDF" produces exactly what is
 * shown. Everything is driven by the ?from/?to range in the URL.
 */

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession("SUPER_ADMIN");
  const { from, to } = await searchParams;

  const fallback = lastMonths(12);
  const range = parseRange(from ?? iso(fallback.from), to ?? iso(fallback.to));
  const fromStr = iso(range.from ?? fallback.from);
  const toStr = iso(range.to ?? fallback.to);
  const qs = `from=${fromStr}&to=${toStr}`;

  const summary = await monthlySummary({ orgId: session.orgId, branchId: null }, range);
  const { totals, months, branches, topProducts } = summary;

  // Bar heights are relative to the busiest month in the window.
  const peak = Math.max(1, ...months.map((m) => m.revenueCents));

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Demand, fulfilment and spend across every salon in the workspace. Pick a window, then print it or pull the raw rows as CSV."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton href={`/api/exports/orders?${qs}`} label="Orders CSV" tone="primary" />
            <ExportButton href="/api/exports/inventory" label="Inventory CSV" />
            <ExportButton href={`/api/exports/movements?${qs}`} label="Movements CSV" />
            <ExportButton href={`/api/exports/audit?${qs}`} label="Audit CSV" />
          </div>
        }
      />

      <div className="mb-5">
        <ReportControls from={fromStr} to={toStr} />
      </div>

      <p className="text-sm text-muted mb-4">
        <span className="text-faint">Reporting period:</span>{" "}
        <span className="text-ink font-medium">
          {fmtDate(range.from)} — {fmtDate(range.to)}
        </span>
      </p>

      <StatGrid
        stats={[
          { label: "Orders", value: totals.orders },
          { label: "Order value", value: formatMoney(totals.revenueCents), tone: "accent" },
          { label: "Units requested", value: totals.unitsRequested },
          { label: "Units delivered", value: totals.unitsDelivered },
          {
            label: "Fill rate",
            value: `${totals.fillRate}%`,
            tone: totals.fillRate >= 95 ? "in" : totals.fillRate >= 80 ? "low" : "out",
          },
          { label: "Still open", value: totals.openOrders },
        ]}
      />

      {(totals.cancelled > 0 || totals.rejected > 0 || totals.returned > 0) && (
        <p className="text-xs text-faint -mt-2 mb-5">
          Excluded from the figures above: {totals.cancelled} cancelled, {totals.rejected} rejected,{" "}
          {totals.returned} returned.
        </p>
      )}

      {/* Month by month */}
      <section className="print-block bg-surface border border-line rounded-[10px] overflow-x-auto mb-5">
        <h2 className="text-sm font-semibold px-4 pt-4 pb-3">Month by month</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-2.5">Month</th>
              <th className="font-medium px-4 py-2.5 text-right">Orders</th>
              <th className="font-medium px-4 py-2.5 text-right">Requested</th>
              <th className="font-medium px-4 py-2.5 text-right">Delivered</th>
              <th className="font-medium px-4 py-2.5 text-right">Fill rate</th>
              <th className="font-medium px-4 py-2.5 text-right">Value</th>
              <th className="font-medium px-4 py-2.5 w-40">Trend</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const fill = m.unitsRequested
                ? Math.round((m.unitsDelivered / m.unitsRequested) * 100)
                : 0;
              return (
                <tr key={m.key} className="border-t border-line-soft">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink">{m.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{m.orders}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{m.unitsRequested}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{m.unitsDelivered}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{fill}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink font-medium whitespace-nowrap">
                    {formatMoney(m.revenueCents)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-2 rounded-full bg-line-soft overflow-hidden">
                      <div
                        className="h-full bg-velvet rounded-full"
                        style={{ width: `${Math.round((m.revenueCents / peak) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {months.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-faint">
                  No orders in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top products */}
        <section className="print-block bg-surface border border-line rounded-[10px] overflow-x-auto">
          <h2 className="text-sm font-semibold px-4 pt-4 pb-3">Top products by value</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                <th className="font-medium px-4 py-2.5">Product</th>
                <th className="font-medium px-4 py-2.5 text-right">Units</th>
                <th className="font-medium px-4 py-2.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.sku} className="border-t border-line-soft">
                  <td className="px-4 py-2.5">
                    <span className="text-ink">{p.name}</span>
                    <span className="text-faint text-xs"> · {p.sku}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{p.units}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink font-medium whitespace-nowrap">
                    {formatMoney(p.revenueCents)}
                  </td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-faint">
                    Nothing ordered in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Branch breakdown */}
        <section className="print-block bg-surface border border-line rounded-[10px] overflow-x-auto">
          <h2 className="text-sm font-semibold px-4 pt-4 pb-3">By salon</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                <th className="font-medium px-4 py-2.5">Salon</th>
                <th className="font-medium px-4 py-2.5 text-right">Orders</th>
                <th className="font-medium px-4 py-2.5 text-right">Units</th>
                <th className="font-medium px-4 py-2.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.name} className="border-t border-line-soft">
                  <td className="px-4 py-2.5 text-ink">{b.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{b.orders}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{b.unitsRequested}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink font-medium whitespace-nowrap">
                    {formatMoney(b.revenueCents)}
                  </td>
                </tr>
              ))}
              {branches.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-faint">
                    No orders in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
