import Link from "next/link";
import { requireScopedSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { salesSummary, lastMonths } from "@/lib/reports";
import { PageHeader } from "@/components/console-ui";
import { SalonMark } from "@/components/salon-mark";

/**
 * Every salon in the group, at a glance.
 *
 * The owner's first question is comparative — which salon is doing well, which
 * has orders stuck — so this is a comparison rather than a directory. Each row
 * opens the branch's own panel.
 */
export default async function AdminSalonsPage() {
  const { session, db } = await requireScopedSession("SUPER_ADMIN");
  const { from, to } = lastMonths(1);

  const [branches, summary, openOrders, shelf] = await Promise.all([
    db.location.findMany({ where: { type: "BRANCH" }, orderBy: { name: "asc" } }),
    salesSummary({ orgId: session.orgId, branchId: null }, { from, to }),
    db.order.groupBy({
      by: ["branchId"],
      where: { status: { in: ["PENDING", "PROCESSING", "PARTIALLY_FULFILLED"] } },
      _count: true,
    }),
    db.branchStock.findMany({ where: { kind: "RETAIL" }, include: { product: true } }),
  ]);

  const salesOf = new Map(summary.branches.map((b) => [b.name, b]));
  const openOf = new Map(openOrders.map((o) => [o.branchId, o._count]));
  const shelfOf = new Map<string, number>();
  for (const s of shelf) {
    shelfOf.set(s.branchId, (shelfOf.get(s.branchId) ?? 0) + s.onHand * s.product.retailPriceCents);
  }

  return (
    <div>
      <PageHeader
        title="Salons"
        subtitle="Each salon in the group, compared over the last month. Open one for its team, its sales and what it is waiting on."
      />

      <div className="grid gap-3 mt-6 sm:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => {
          const s = salesOf.get(b.name);
          const open = openOf.get(b.id) ?? 0;
          return (
            <Link
              key={b.id}
              href={`/admin/salons/${b.id}`}
              className="block bg-surface border border-line rounded-xl p-5 hover:border-velvet/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <SalonMark name={b.name} logoUrl={null} size={34} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{b.name}</div>
                  <div className="text-[11px] text-faint">
                    {b.isActive ? "Trading" : "Closed"}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 mt-4">
                <Cell label="Revenue (30d)" value={formatMoney(s?.revenueCents ?? 0)} />
                <Cell label="Bills" value={String(s?.bills ?? 0)} />
                <Cell label="Shelf value" value={formatMoney(shelfOf.get(b.id) ?? 0)} />
                <Cell
                  label="Open orders"
                  value={String(open)}
                  // Not an error, but the thing an owner most wants to notice.
                  tone={open > 0 ? "attention" : undefined}
                />
              </dl>
            </Link>
          );
        })}
      </div>

      {branches.length === 0 && (
        <p className="text-muted text-sm mt-6">
          No salons yet. Add one in Users &amp; salons.
        </p>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "attention";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd
        className={`text-sm font-semibold tabular-nums mt-0.5 ${
          tone === "attention" ? "text-velvet" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
