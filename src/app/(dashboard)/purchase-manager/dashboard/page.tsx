import Link from "next/link";
import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { orderCode, fmtDate } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";

export default async function PmDashboardPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const branchId = session.locationId ?? undefined;

  const [orders, products, reserved] = await Promise.all([
    db.order.findMany({
      where: { branchId },
      include: { items: { select: { requestedQty: true, deliveredQty: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.product.findMany({ where: { active: true } }),
    reservedByProduct(session.orgId),
  ]);

  const inMotion = orders.filter((o) => o.status === "PENDING" || o.status === "PROCESSING").length;
  const outstandingLines = orders
    .filter((o) => o.status === "PARTIALLY_FULFILLED")
    .reduce((s, o) => s + o.items.filter((it) => it.deliveredQty < it.requestedQty).length, 0);
  const thisMonth = orders.filter((o) => o.status !== "CANCELLED").length;
  const lowStock = products.filter((p) => {
    const st = stockState(availableOf(p.stock, reserved.get(p.id) ?? 0), p.minStock);
    return st !== "in";
  }).length;

  const stats: [string, number, string][] = [
    ["Orders in motion", inMotion, "/purchase-manager/orders"],
    ["Lines pending supply", outstandingLines, "/purchase-manager/orders"],
    ["Orders placed", thisMonth, "/purchase-manager/orders"],
    ["Low / out of stock", lowStock, "/purchase-manager/catalogue"],
  ];

  const recent = orders.slice(0, 5);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-semibold">
        Good day, {session.name.split(" ")[0]}.
      </h1>
      <p className="text-muted mt-1">
        {inMotion === 0 ? "No orders currently in motion." : `${inMotion} order${inMotion === 1 ? "" : "s"} in motion`}
        {outstandingLines > 0 ? `, ${outstandingLines} line${outstandingLines === 1 ? "" : "s"} pending supply.` : "."}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {stats.map(([label, n, href]) => (
          <Link
            key={label}
            href={href}
            className="bg-surface border border-line rounded-xl p-4 hover:border-velvet/40 transition-colors"
          >
            <div className="text-xs text-muted">{label}</div>
            <div className="font-display text-3xl font-semibold mt-1">{n}</div>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-medium">Recent orders</h2>
        <Link href="/purchase-manager/orders" className="text-sm text-velvet hover:text-velvet-dark">
          View all
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="text-muted text-sm">No orders yet. Head to the catalogue to place your first order.</p>
      ) : (
        <div className="space-y-2">
          {recent.map((o) => (
            <Link
              key={o.id}
              href={`/purchase-manager/orders/${o.id}`}
              className="flex items-center gap-3 bg-surface border border-line rounded-xl p-3.5 hover:border-velvet/40 transition-colors"
            >
              <span className="font-medium text-sm">{orderCode(o.orderNo)}</span>
              <span className="text-xs text-faint">{fmtDate(o.createdAt)}</span>
              <span className="ml-auto"><StatusChip status={o.status} /></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
