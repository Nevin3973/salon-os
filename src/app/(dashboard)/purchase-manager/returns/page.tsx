import Link from "next/link";
import { requireScopedSession, activeOrgSettings } from "@/lib/tenant";
import { priceBasisFor } from "@/lib/pricing";
import { orderCode, fmtDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

/// Purchase returns as seen by the branch that made them.
///
/// The warehouse's own returns screen is where a return is *raised*; this is
/// the record of what has already gone back, which is what a purchase manager
/// needs when reconciling what their branch was charged for against what it
/// actually kept.

export default async function ReturnsPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const { showCostToManager } = await activeOrgSettings();
  const basis = priceBasisFor(session.role, showCostToManager);
  const unit = (it: { unitPriceCents: number; mrpCents: number }) =>
    basis === "COST" ? it.unitPriceCents : it.mrpCents;
  const branchId = session.locationId;

  const returns = branchId
    ? await db.orderItemDelivery.findMany({
        where: { kind: "RETURN", orderItem: { order: { branchId } } },
        include: {
          orderItem: {
            include: {
              product: { select: { name: true, brand: true, unit: true } },
              order: { select: { id: true, orderNo: true, closureReason: true, closureNote: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const totalUnits = returns.reduce((s, r) => s + r.qty, 0);
  const totalValue = returns.reduce((s, r) => s + r.qty * unit(r.orderItem), 0);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Purchase returns</h1>
      <p className="text-muted text-sm mb-5">
        Everything your branch has sent back to the warehouse, valued at the rate you were
        charged.
      </p>

      {!branchId ? (
        <p className="text-muted text-sm">Your account is not assigned to a branch.</p>
      ) : returns.length === 0 ? (
        <p className="text-muted text-sm">
          Nothing has gone back to the warehouse from your branch yet.
        </p>
      ) : (
        <>
          <p className="text-sm mb-4">
            <span className="font-medium">{totalUnits}</span> unit{totalUnits === 1 ? "" : "s"}{" "}
            returned across {returns.length} line{returns.length === 1 ? "" : "s"} —{" "}
            <span className="font-medium">{formatMoney(totalValue)}</span>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-line">
                  <th className="py-2 pr-4 font-medium">Returned</th>
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Reason</th>
                  <th className="py-2 pl-2 text-right font-medium tabular-nums">Qty</th>
                  <th className="py-2 pl-2 text-right font-medium tabular-nums">Value</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => {
                  const it = r.orderItem;
                  return (
                    <tr key={r.id} className="border-b border-line/60">
                      <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                      <td className="py-2 pr-4">
                        <span className="block">{it.product.name}</span>
                        <span className="text-muted text-xs">{it.product.brand}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/purchase-manager/orders/${it.order.id}`}
                          className="underline underline-offset-2"
                        >
                          {orderCode(it.order.orderNo)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="block">{it.order.closureReason ?? "—"}</span>
                        {it.order.closureNote ? (
                          <span className="text-muted text-xs">{it.order.closureNote}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">{r.qty}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {formatMoney(r.qty * unit(it))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
