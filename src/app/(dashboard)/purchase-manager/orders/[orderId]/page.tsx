import Link from "next/link";
import { notFound } from "next/navigation";
import { requireScopedSession } from "@/lib/tenant";
import { orderCode, fmtDate, fmtDateTime } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import { OrderActions } from "./order-actions";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const { orderId } = await params;
  const { placed } = await searchParams;

  const order = await db.order.findFirst({
    where: { id: orderId, branchId: session.locationId ?? undefined },
    include: {
      items: {
        include: {
          product: { select: { name: true, brand: true, unit: true } },
          deliveries: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!order) notFound();

  const totalReq = order.items.reduce((s, it) => s + it.requestedQty, 0);
  const totalDel = order.items.reduce((s, it) => s + it.deliveredQty, 0);

  // Build a simple delivery timeline from all deliveries across items.
  const timeline = order.items
    .flatMap((it) =>
      it.deliveries.map((d) => ({ name: it.product.name, qty: d.qty, at: d.createdAt }))
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="max-w-3xl">
      <Link href="/purchase-manager/orders" className="text-sm text-muted hover:text-ink">
        ← All orders
      </Link>

      {placed && (
        <div className="mt-3 flex items-center gap-3 bg-velvet-soft border border-velvet/20 rounded-xl px-4 py-3">
          <span className="w-8 h-8 rounded-full bg-velvet text-white grid place-items-center shrink-0">✓</span>
          <div className="text-sm">
            <span className="font-medium text-ink">Order placed.</span>{" "}
            <span className="text-muted">
              It’s been sent to the warehouse and stock is reserved. Track dispatch and delivery below.
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap mt-3">
        <h1 className="font-display text-2xl font-semibold">{orderCode(order.orderNo)}</h1>
        <StatusChip status={order.status} />
        <span className="text-sm text-faint">Placed {fmtDate(order.createdAt)}</span>
        <div className="ml-auto">
          <OrderActions orderId={order.id} status={order.status} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-surface border border-line rounded-xl p-4 mt-4">
        <div className="flex justify-between text-xs text-muted mb-1.5">
          <span>Delivery progress</span>
          <span className="tabular-nums">{totalDel} / {totalReq} units</span>
        </div>
        <div className="h-2 rounded-full bg-line overflow-hidden">
          <div
            className="h-full bg-velvet rounded-full transition-all"
            style={{ width: `${totalReq ? Math.round((totalDel / totalReq) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface border border-line rounded-xl divide-y divide-line mt-4">
        {order.items.map((it) => {
          const outstanding = it.requestedQty - it.deliveredQty;
          const done = outstanding <= 0;
          return (
            <div key={it.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{it.product.name}</div>
                  <div className="text-xs text-muted">{it.product.brand} · per {it.product.unit}</div>
                  {it.note && <div className="text-xs text-faint italic mt-1">“{it.note}”</div>}
                </div>
                <div className="text-right text-sm shrink-0">
                  <span className={done ? "text-in font-medium" : ""}>
                    {it.deliveredQty}/{it.requestedQty}
                  </span>
                  <div className="text-xs text-muted">delivered</div>
                </div>
              </div>

              {!done && order.status !== "CANCELLED" && (
                <div className="text-xs text-low mt-2">
                  {outstanding} outstanding
                  {it.outstandingReason ? ` · ${it.outstandingReason}` : ""}
                  {it.outstandingEta ? ` · expected ${fmtDate(it.outstandingEta)}` : ""}
                </div>
              )}

              {it.deliveries.length > 0 && (
                <div className="text-xs text-faint mt-2">
                  {it.deliveries.map((d) => `${d.qty} on ${fmtDateTime(d.createdAt)}`).join(" · ")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="mt-6">
          <h2 className="font-medium text-sm mb-3">Dispatch history</h2>
          <ol className="relative border-l border-line ml-2 space-y-4">
            {timeline.map((t, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-velvet border-2 border-bg" />
                <div className="text-sm">{t.qty} × {t.name}</div>
                <div className="text-xs text-faint">{fmtDateTime(t.at)}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
