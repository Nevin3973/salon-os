import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { fmtDate, orderCode } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/status-chip";
import Link from "next/link";

export default async function OverviewPage() {
  const { session, db } = await requireScopedSession("SUPER_ADMIN");

  const [orders, products, memberships, branches] = await Promise.all([
    db.order.findMany({
      include: {
        branch: { select: { name: true } },
        items: { select: { requestedQty: true, deliveredQty: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.product.findMany(),
    db.membership.count(),
    db.location.findMany({ where: { type: "BRANCH" } }),
  ]);

  const reserved = await reservedByProduct(session.orgId);

  const activeProducts = products.filter((p) => p.active);
  const outstandingLines = orders
    .filter((o) => o.status === "PARTIALLY_FULFILLED")
    .reduce((s, o) => s + o.items.filter((it) => it.deliveredQty < it.requestedQty).length, 0);
  const lowOrOut = activeProducts.filter(
    (p) => stockState(availableOf(p.stock, reserved.get(p.id) ?? 0), p.minStock) !== "in"
  ).length;

  // Orders per branch
  const branchCounts = new Map<string, number>();
  for (const b of branches) branchCounts.set(b.name, 0);
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    branchCounts.set(o.branch.name, (branchCounts.get(o.branch.name) ?? 0) + 1);
  }
  const maxBranch = Math.max(1, ...branchCounts.values());

  // Orders per day, last 14 days
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    days.push({
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      count: orders.filter((o) => o.createdAt >= d && o.createdAt < next).length,
    });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));
  const points = days
    .map((d, i) => {
      const x = (i / Math.max(days.length - 1, 1)) * 440 + 30;
      const y = 92 - (d.count / maxDay) * 64;
      return `${x},${y}`;
    })
    .join(" ");

  // Category tiles
  const catCounts = new Map<string, number>();
  for (const p of activeProducts) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);

  const totalValueCents = orders
    .filter((o) => o.status !== "CANCELLED")
    .reduce((s, o) => s + o.totalCents, 0);

  const kpis: [string, number | string][] = [
    ["Total orders", orders.filter((o) => o.status !== "CANCELLED").length],
    ["Order value", formatMoney(totalValueCents)],
    ["Lines waiting on stock", outstandingLines],
    ["Low or out of stock", lowOrOut],
    ["Team members", memberships],
    ["Products for sale", activeProducts.length],
  ];

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-faint font-medium">
        Head office · {fmtDate(new Date())}
      </p>
      <h1 className="text-2xl font-semibold mt-1">Overview</h1>

      {/* KPI row */}
      <div className="grid gap-px bg-line border border-line rounded-[10px] overflow-hidden mt-6"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {kpis.map(([label, n]) => (
          <div key={label} className="bg-surface p-5">
            <div className="text-[11px] uppercase tracking-[0.12em] text-faint font-medium">{label}</div>
            <div className="text-2xl font-semibold mt-2 tabular-nums">{n}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {/* Orders by branch */}
        <div className="bg-surface border border-line rounded-[10px] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted mb-4">
            Orders by branch
          </h3>
          <div className="space-y-3">
            {[...branchCounts.entries()].map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted truncate">{name}</span>
                <div className="flex-1 bg-surface-raised h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-velvet rounded-full"
                    style={{ width: `${(count / maxBranch) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums w-6 text-right">{count}</span>
              </div>
            ))}
            {branchCounts.size === 0 && <p className="text-faint text-xs">No orders yet.</p>}
          </div>
        </div>

        {/* Orders over time */}
        <div className="bg-surface border border-line rounded-[10px] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted mb-4">
            Orders — last 14 days
          </h3>
          <svg viewBox="0 0 500 120" className="w-full" style={{ height: 120 }}>
            <polyline fill="none" stroke="var(--color-velvet)" strokeWidth="2" points={points} />
            {days.map((d, i) => {
              const x = (i / Math.max(days.length - 1, 1)) * 440 + 30;
              const y = 92 - (d.count / maxDay) * 64;
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="3" fill="var(--color-surface)" stroke="var(--color-velvet)" strokeWidth="2" />
                  {i % 2 === 0 && (
                    <text x={x} y="112" fontSize="8.5" fill="var(--color-faint)" textAnchor="middle">
                      {d.label}
                    </text>
                  )}
                  {d.count > 0 && (
                    <text x={x} y={y - 8} fontSize="9" fill="var(--color-ink)" fontWeight="600" textAnchor="middle">
                      {d.count}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Categories */}
        <div className="bg-surface border border-line rounded-[10px] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted mb-4">
            Products by category
          </h3>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {[...catCounts.entries()].slice(0, 9).map(([cat, count]) => (
              <div key={cat} className="bg-surface-raised border border-line-soft rounded-[6px] p-3">
                <div className="text-[10px] uppercase tracking-wide text-faint truncate">{cat}</div>
                <div className="text-lg font-semibold mt-1 tabular-nums">{count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-surface border border-line rounded-[10px] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted mb-4">
            Latest orders
          </h3>
          <div className="space-y-2.5">
            {orders.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center gap-3 text-sm">
                <span className="font-medium tabular-nums">{orderCode(o.orderNo)}</span>
                <span className="text-faint text-xs truncate">{o.branch.name}</span>
                <span className="text-xs font-semibold ml-auto">{formatMoney(o.totalCents)}</span>
                <StatusChip status={o.status} />
              </div>
            ))}
            {orders.length === 0 && <p className="text-faint text-xs">No orders yet.</p>}
          </div>
          <Link href="/admin/audit" className="inline-block mt-4 text-xs text-velvet hover:text-velvet-dark font-medium">
            See the full audit log →
          </Link>
        </div>
      </div>
    </div>
  );
}
