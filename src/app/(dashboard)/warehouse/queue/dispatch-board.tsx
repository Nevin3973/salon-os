"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { startProcessing, applyDispatch } from "@/lib/actions/dispatch";

export type QueueItem = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  requestedQty: number;
  deliveredQty: number;
  stock: number;
  note: string | null;
  deliveries: { qty: number; at: string }[];
};
export type QueueOrder = {
  id: string;
  code: string;
  branchName: string;
  placedBy: string;
  createdAt: string;
  status: "PENDING" | "PROCESSING";
  items: QueueItem[];
};

type Draft = Record<string, { dispatch: number; reason: string; eta: string; remark: string }>;

export function DispatchBoard({ orders, reasons }: { orders: QueueOrder[]; reasons: string[] }) {
  if (orders.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-xl p-10 text-center text-muted">
        Nothing waiting. You’re all caught up.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} reasons={reasons} />
      ))}
    </div>
  );
}

function lineMax(it: QueueItem) {
  return Math.min(it.requestedQty - it.deliveredQty, it.stock);
}

function OrderCard({ order, reasons }: { order: QueueOrder; reasons: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(order.status === "PROCESSING");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = {};
    for (const it of order.items) d[it.id] = { dispatch: lineMax(it), reason: "", eta: "", remark: "" };
    return d;
  });

  const totalRemaining = order.items.reduce((s, it) => s + (it.requestedQty - it.deliveredQty), 0);
  const draftTotal = order.items.reduce((s, it) => s + (draft[it.id]?.dispatch ?? 0), 0);

  function setD(itemId: string, patch: Partial<Draft[string]>) {
    setDraft((d) => ({ ...d, [itemId]: { ...d[itemId], ...patch } }));
  }

  function start() {
    setError("");
    startTransition(async () => {
      const res = await startProcessing({ orderId: order.id });
      if (!res.ok) setError(res.error);
      else {
        setOpen(true);
        router.refresh();
      }
    });
  }

  function dispatch(closing: boolean) {
    setError("");
    startTransition(async () => {
      const lines = order.items.map((it) => ({
        orderItemId: it.id,
        dispatch: draft[it.id]?.dispatch ?? 0,
        reason: draft[it.id]?.reason || undefined,
        eta: draft[it.id]?.eta || undefined,
        remark: draft[it.id]?.remark || undefined,
      }));
      const res = await applyDispatch({ orderId: order.id, closing, lines });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-bg/50 transition-colors flex-wrap"
      >
        <span className="font-medium">{order.code}</span>
        <span className="text-xs text-faint">
          {order.branchName} · {order.placedBy} · {fmtDate(order.createdAt)}
        </span>
        <span className="text-xs text-muted">{totalRemaining} unit{totalRemaining === 1 ? "" : "s"} remaining</span>
        <span
          className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${
            order.status === "PENDING" ? "bg-slate-100 text-slate-600" : "bg-velvet-soft text-velvet"
          }`}
        >
          {order.status === "PENDING" ? "Pending" : "Processing"}
        </span>
      </button>

      {open && (
        <div className="border-t border-line p-4 space-y-3">
          {order.items.map((it) => {
            const remaining = it.requestedQty - it.deliveredQty;
            const max = lineMax(it);
            const line = draft[it.id];
            const shortAfter = remaining - (line?.dispatch ?? 0);
            const stockLimited = it.stock < remaining;
            return (
              <div key={it.id} className="border border-line rounded-lg p-3">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium text-sm">{it.name}</div>
                    <div className="text-xs text-muted">{it.brand} · per {it.unit}</div>
                    {it.note && <div className="text-xs text-faint italic mt-0.5">“{it.note}”</div>}
                    {it.deliveries.length > 0 && (
                      <div className="text-xs text-faint mt-1">
                        {it.deliveries.map((d) => `${d.qty} sent ${fmtDateTime(d.at)}`).join(" · ")}
                      </div>
                    )}
                  </div>

                  <Metric label="Requested" value={it.requestedQty} />
                  <Metric label="Remaining" value={remaining} tone={remaining > 0 ? "" : "text-in"} />
                  <Metric label="In stock" value={it.stock} tone={stockLimited ? "text-low" : ""} />

                  <div className="w-24">
                    <div className="text-[10px] uppercase tracking-wide text-faint mb-1">Dispatch now</div>
                    {order.status === "PROCESSING" && remaining > 0 ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={max}
                          value={line?.dispatch ?? 0}
                          onChange={(e) =>
                            setD(it.id, {
                              dispatch: Math.max(0, Math.min(max, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-full bg-bg border border-line rounded-md px-2 h-9 text-sm focus:border-velvet outline-none"
                          aria-label={`Dispatch quantity for ${it.name}, max ${max}`}
                        />
                        <div className="text-[10px] text-faint mt-1">
                          max {max}
                          {stockLimited && <span className="text-low"> · stock-limited</span>}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-in font-medium">{remaining === 0 ? "done" : "—"}</div>
                    )}
                  </div>
                </div>

                {order.status === "PROCESSING" && shortAfter > 0 && (
                  <div className="grid sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-line">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-low mb-1">
                        Will remain short · {shortAfter}
                      </div>
                      <select
                        value={line?.reason ?? ""}
                        onChange={(e) => setD(it.id, { reason: e.target.value })}
                        className="w-full bg-bg border border-line rounded-md px-2 h-9 text-sm focus:border-velvet outline-none"
                      >
                        <option value="">Reason (to close)…</option>
                        {reasons.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-faint mb-1">Expected</div>
                      <input
                        type="date"
                        value={line?.eta ?? ""}
                        onChange={(e) => setD(it.id, { eta: e.target.value })}
                        className="w-full bg-bg border border-line rounded-md px-2 h-9 text-sm focus:border-velvet outline-none"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-faint mb-1">Remark</div>
                      <input
                        value={line?.remark ?? ""}
                        onChange={(e) => setD(it.id, { remark: e.target.value })}
                        placeholder="Optional"
                        className="w-full bg-bg border border-line rounded-md px-2 h-9 text-sm focus:border-velvet outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {error && <p className="text-out text-sm">{error}</p>}

          {order.status === "PENDING" ? (
            <button
              onClick={start}
              disabled={pending}
              className="h-10 px-5 rounded-full bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-60"
            >
              {pending ? "…" : "Start processing"}
            </button>
          ) : (
            <div className="flex gap-3 flex-wrap items-center">
              <button
                onClick={() => dispatch(false)}
                disabled={pending || draftTotal === 0 || draftTotal === totalRemaining}
                className="h-10 px-5 rounded-full border border-velvet text-velvet text-sm font-semibold hover:bg-velvet-soft transition-colors disabled:opacity-40"
              >
                Dispatch {draftTotal} now — keep open
              </button>
              {confirmClose ? (
                <button
                  onClick={() => dispatch(true)}
                  disabled={pending}
                  onBlur={() => setConfirmClose(false)}
                  className="h-10 px-5 rounded-full bg-plum text-white text-sm font-semibold"
                >
                  Confirm — settle order
                </button>
              ) : (
                <button
                  onClick={() => setConfirmClose(true)}
                  className="h-10 px-5 rounded-full bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors"
                >
                  {draftTotal === totalRemaining
                    ? "Dispatch all & complete"
                    : `Close order — ${totalRemaining - draftTotal} outstanding`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="w-16">
      <div className="text-[10px] uppercase tracking-wide text-faint mb-1">{label}</div>
      <div className={`text-sm tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
