import { requireScopedSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { salesSummary, parseRange } from "@/lib/reports";
import { StaffSales } from "../../salon/reports/staff-sales";
import { PageHeader, StatGrid } from "@/components/console-ui";
import { ReportControls } from "../../salon/reports/report-controls";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Retail trade across every branch.
 *
 * Head office previously had no view of this at all: /admin/reports covers
 * procurement — what the salons ordered from the warehouse — while everything
 * sold over the counter was visible only to the branch that sold it. So the
 * one person accountable for the group could not see which products actually
 * sell, or who is selling them.
 *
 * Same `salesSummary` the branch report uses, with branchId null so it spans
 * the org. Sharing the function is deliberate: two implementations of "revenue"
 * would eventually disagree, and then nobody would trust either.
 */
export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { session } = await requireScopedSession("SUPER_ADMIN");
  const { from, to } = await searchParams;

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);

  const range = parseRange(from ?? iso(start), to ?? iso(end));
  const fromStr = iso(range.from ?? start);
  const toStr = iso(range.to ?? end);

  const { totals, topProducts, staff, branches } = await salesSummary(
    { orgId: session.orgId, branchId: null },
    range
  );

  return (
    <div>
      <PageHeader
        title="Retail sales"
        subtitle="What every branch has sold to walk-in customers — products, branches and the people behind the counter. Supplies ordered from the warehouse are in Reports."
      />

      <ReportControls from={fromStr} to={toStr} basePath="/admin/sales" />

      <StatGrid
        stats={[
          { label: "Bills", value: String(totals.bills) },
          { label: "Revenue", value: formatMoney(totals.grossCents) },
          { label: "Units sold", value: String(totals.units) },
          { label: "Margin", value: formatMoney(totals.marginCents) },
          { label: "Returned", value: formatMoney(totals.returnedCents) },
        ]}
      />

      {totals.bills === 0 ? (
        <p className="text-muted text-sm mt-8">
          No counter sales in this window. Widen the dates, or check that branches are billing
          through the till.
        </p>
      ) : (
        <>
          <Panel title="By branch" blurb="Revenue is what customers paid; margin is after what the stock cost.">
            <Table
              head={["Branch", "Bills", "Units", "Revenue", "Margin"]}
              rows={branches.map((b) => [
                b.name,
                String(b.bills),
                String(b.units),
                formatMoney(b.revenueCents),
                formatMoney(b.marginCents),
              ])}
            />
          </Panel>

          <Panel title="Best selling products" blurb="Across the whole group, netted for returns.">
            <Table
              head={["Product", "Units", "Revenue", "Margin"]}
              rows={topProducts.map((p) => [
                p.name,
                String(p.units),
                formatMoney(p.revenueCents),
                formatMoney(p.marginCents),
              ])}
            />
          </Panel>

          <section className="mt-8">
            <h2 className="text-sm font-semibold">Sales by staff</h2>
            <p className="text-muted text-xs mt-0.5 mb-3">
              Every branch together. Open a row to see what that person sells best.
            </p>
            <StaffSales rows={staff} />
          </section>
        </>
      )}
    </div>
  );
}

function Panel({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-muted text-xs mt-0.5">{blurb}</p>
      <div className="bg-surface border border-line rounded-xl overflow-x-auto mt-3">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-sm text-muted">Nothing in this window.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
          {head.map((h, i) => (
            <th key={h} className={`font-medium px-4 py-3 ${i === 0 ? "" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line-soft">
            {r.map((cell, j) => (
              <td
                key={j}
                className={`px-4 py-3 ${j === 0 ? "font-medium" : "text-right tabular-nums"}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
