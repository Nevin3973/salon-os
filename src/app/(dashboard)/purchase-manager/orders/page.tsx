import Link from "next/link";
import { requireScopedSession } from "@/lib/tenant";
import { orderCode, fmtDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/status-chip";
import { OrderSearch } from "./order-search";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const { q } = await searchParams;

  const orders = await db.order.findMany({
    where: { branchId: session.locationId ?? undefined },
    include: { items: { select: { requestedQty: true, deliveredQty: true, product: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  const query = (q ?? "").trim().toLowerCase();
  const filtered = orders.filter((o) => {
    if (!query) return true;
    return (
      orderCode(o.orderNo).toLowerCase().includes(query) ||
      o.items.some((it) => it.product.name.toLowerCase().includes(query))
    );
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">My orders</h1>
      <p className="text-muted text-sm mb-5">Track dispatch and delivery for every order your branch has placed.</p>

      <OrderSearch initial={q ?? ""} />

      {filtered.length === 0 ? (
        <p className="text-muted mt-10 text-center">
          {query ? `No orders match “${q}”.` : "No orders yet. Place one from the catalogue."}
        </p>
      ) : (
        <div className="space-y-3 mt-5">
          {filtered.map((o) => {
            const totalReq = o.items.reduce((s, it) => s + it.requestedQty, 0);
            const totalDel = o.items.reduce((s, it) => s + it.deliveredQty, 0);
            const outstanding = o.items.filter((it) => it.deliveredQty < it.requestedQty).length;
            return (
              <Link
                key={o.id}
                href={`/purchase-manager/orders/${o.id}`}
                className="block bg-surface border border-line rounded-xl p-4 hover:border-velvet/40 hover:shadow-[0_2px_16px_rgba(27,22,38,0.06)] transition-all"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium">{orderCode(o.orderNo)}</span>
                  <span className="font-semibold">{formatMoney(o.totalCents)}</span>
                  <span className="text-xs text-faint">{fmtDate(o.createdAt)}</span>
                  <span className="ml-auto"><StatusChip status={o.status} /></span>
                </div>
                <div className="text-sm text-muted mt-2">
                  {o.items.length} item{o.items.length === 1 ? "" : "s"} · {totalDel}/{totalReq} units delivered
                  {outstanding > 0 && o.status !== "CANCELLED" ? (
                    <span className="text-low"> · {outstanding} line{outstanding === 1 ? "" : "s"} pending</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
