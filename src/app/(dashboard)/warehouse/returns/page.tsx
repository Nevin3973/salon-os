import { requireScopedSession } from "@/lib/tenant";
import { orderCode } from "@/lib/format";
import { RETURN_REASONS } from "@/lib/constants";
import { PageHeader, StatGrid } from "@/components/console-ui";
import { ReturnsBoard, type ReturnableOrder } from "./returns-board";

/**
 * Goods coming back. Only settled orders that still have units with the branch
 * can be returned against — a return is the mirror of a dispatch, so there has
 * to be something out there to mirror.
 */

const WINDOW_DAYS = 90;

export default async function ReturnsPage() {
  const { db } = await requireScopedSession("WAREHOUSE_MANAGER");

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const orders = await db.order.findMany({
    where: {
      status: { in: ["COMPLETED", "PARTIALLY_FULFILLED"] },
      updatedAt: { gte: since },
    },
    include: {
      branch: { select: { name: true } },
      items: { include: { product: { select: { name: true, brand: true, unit: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const board: ReturnableOrder[] = orders
    .map((o) => ({
      id: o.id,
      code: orderCode(o.orderNo),
      branchName: o.branch.name,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        id: it.id,
        name: it.product.name,
        brand: it.product.brand,
        unit: it.product.unit,
        held: it.deliveredQty,
        returnedQty: it.returnedQty,
      })),
    }))
    // Nothing with the branch, nothing to take back.
    .filter((o) => o.items.some((it) => it.held > 0));

  const unitsOut = board.reduce((s, o) => s + o.items.reduce((n, it) => n + it.held, 0), 0);
  const alreadyReturned = orders.reduce(
    (s, o) => s + o.items.reduce((n, it) => n + it.returnedQty, 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="Returns"
        subtitle={`Book delivered goods back into stock. Shows orders settled in the last ${WINDOW_DAYS} days that still have units with a branch.`}
      />

      <StatGrid
        stats={[
          { label: "Orders returnable", value: board.length },
          { label: "Units with branches", value: unitsOut },
          { label: "Returned so far", value: alreadyReturned, tone: alreadyReturned ? "low" : "default" },
        ]}
      />

      <ReturnsBoard orders={board} reasons={[...RETURN_REASONS]} />
    </div>
  );
}
