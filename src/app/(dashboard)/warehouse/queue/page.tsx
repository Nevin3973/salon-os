import { requireScopedSession } from "@/lib/tenant";
import { orderCode } from "@/lib/format";
import { OUTSTANDING_REASONS } from "@/lib/constants";
import { DispatchBoard, type QueueOrder } from "./dispatch-board";

export default async function QueuePage() {
  const { session, db } = await requireScopedSession("WAREHOUSE_MANAGER");

  const orders = await db.order.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] } },
    include: {
      branch: { select: { name: true } },
      items: {
        include: {
          product: { select: { name: true, brand: true, unit: true, stock: true } },
          deliveries: { orderBy: { createdAt: "asc" }, select: { qty: true, createdAt: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Resolve placedBy user names (no relation on Order.placedByUserId).
  const userIds = [...new Set(orders.map((o) => o.placedByUserId))];
  const users = await db.membership.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, user: { select: { name: true } } },
  });
  const nameOf = new Map(users.map((u) => [u.userId, u.user.name]));

  const queue: QueueOrder[] = orders.map((o) => ({
    id: o.id,
    code: orderCode(o.orderNo),
    branchName: o.branch.name,
    placedBy: nameOf.get(o.placedByUserId) ?? "—",
    createdAt: o.createdAt.toISOString(),
    status: o.status as "PENDING" | "PROCESSING",
    items: o.items.map((it) => ({
      id: it.id,
      name: it.product.name,
      brand: it.product.brand,
      unit: it.product.unit,
      requestedQty: it.requestedQty,
      deliveredQty: it.deliveredQty,
      stock: it.product.stock,
      note: it.note,
      deliveries: it.deliveries.map((d) => ({ qty: d.qty, at: d.createdAt.toISOString() })),
    })),
  }));

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">Order queue</h1>
        <p className="text-muted text-sm mt-1">
          {queue.length === 0
            ? "The queue is clear. New branch orders appear here the moment they’re placed."
            : `${queue.length} order${queue.length === 1 ? "" : "s"} to process. Dispatch what you have now and keep an order open, or close it and log what’s outstanding.`}
        </p>
      </div>

      <DispatchBoard orders={queue} reasons={[...OUTSTANDING_REASONS]} />
    </div>
  );
}
