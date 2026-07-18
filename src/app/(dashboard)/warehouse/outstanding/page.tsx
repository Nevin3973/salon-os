import { requireScopedSession } from "@/lib/tenant";
import { orderCode, fmtDate } from "@/lib/format";
import { OutstandingTable, type OutstandingRow } from "./outstanding-table";

export default async function OutstandingPage() {
  const { db } = await requireScopedSession("WAREHOUSE_MANAGER");

  const orders = await db.order.findMany({
    where: { status: "PARTIALLY_FULFILLED" },
    include: {
      branch: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, stock: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: OutstandingRow[] = orders.flatMap((o) =>
    o.items
      .filter((it) => it.deliveredQty < it.requestedQty)
      .map((it) => ({
        orderItemId: it.id,
        orderCode: orderCode(o.orderNo),
        branchName: o.branch.name,
        productName: it.product.name,
        owed: it.requestedQty - it.deliveredQty,
        stock: it.product.stock,
        reason: it.outstandingReason ?? null,
        eta: it.outstandingEta ? fmtDate(it.outstandingEta) : null,
      }))
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink">Outstanding items</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed max-w-2xl">
          Everything still owed to the branches, including requirements placed for out-of-stock
          products. Fulfil a line once stock lands — the delivery is timestamped and the branch sees
          it immediately.
        </p>
        {rows.length > 0 && (
          <div className="mt-4">
            <div className="glass-surface rounded-xl px-4 py-2.5 inline-flex items-center gap-2 animate-scale-in">
              <span className="w-2 h-2 rounded-full bg-low animate-pulse-soft" />
              <span className="text-xs text-low font-semibold">{rows.length} item{rows.length !== 1 ? "s" : ""} outstanding</span>
            </div>
          </div>
        )}
      </div>
      <OutstandingTable rows={rows} />
    </div>
  );
}
