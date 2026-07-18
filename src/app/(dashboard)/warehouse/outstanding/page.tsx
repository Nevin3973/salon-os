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
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">Outstanding items</h1>
        <p className="text-muted text-sm mt-1">
          Everything still owed to the branches, including requirements placed for out-of-stock
          products. Fulfil a line once stock lands — the delivery is timestamped and the branch sees
          it immediately.
        </p>
      </div>
      <OutstandingTable rows={rows} />
    </div>
  );
}
