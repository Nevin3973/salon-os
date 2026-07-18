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
      <div className="glass-surface rounded-xl p-12 text-center animate-scale-in">
        <div className="w-12 h-12 rounded-full bg-in-soft mx-auto mb-4 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-in">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <p className="text-muted font-medium">All caught up</p>
        <p className="text-faint text-sm mt-1">Nothing waiting. New orders appear here automatically.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 stagger-children">
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
    <div className="glass-surface rounded-xl overflow-hidden animate-slide-up hover-lift">
      {/* Order header — collapsible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-velvet-soft/20 transition-colors cursor-pointer flex-wrap"
      >
        <span className="font-semibold text-ink">{order.code}</span>
        <span className="text-xs text-faint">
          {order.branchName} · {order.placedBy} · {fmtDate(order.createdAt)}
        </span>
        <span className="text-xs text-muted font-medium">{totalRemaining} unit{totalRemaining === 1 ? "" : "s"} remaining</span>
        <span
          className={`ml-auto text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
            order.status === "PENDING"
              ? "bg-surface-raised text-muted border-line"
              : "bg-velvet-soft text-velvet border-velvet/20"
          }`}
        >
          {order.status === "PENDING" ? "Pending" : "Processing"}
        </span>
        {/* Chevron */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-faint transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-line-soft p-4 sm:p-5 space-y-4 animate-fade-in">
          {order.items.map((it) => {
            const remaining = it.requestedQty - it.deliveredQty;
            const max = lineMax(it);
            const line = draft[it.id];
            const shortAfter = remaining - (line?.dispatch ?? 0);
            const stockLimited = it.stock < remaining;
            return (
              <div key={it.id} className="border border-line-soft rounded-xl p-4 hover:border-velvet/20 transition-colors">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium text-sm text-ink">{it.name}</div>
                    <div className="text-xs text-muted mt-0.5">{it.brand} · per {it.unit}</div>
                    {it.note && <div className="text-xs text-faint italic mt-1">&ldquo;{it.note}&rdquo;</div>}
                    {it.deliveries.length > 0 && (
                      <div className="text-xs text-faint mt-1.5">
                        {it.deliveries.map((d) => `${d.qty} sent ${fmtDateTime(d.at)}`).join(" · ")}
                      </div>
                    )}
                  </div>

                  <Metric label="Requested" value={it.requestedQty} />
                  <Metric label="Remaining" value={remaining} tone={remaining > 0 ? "" : "text-in"} />
                  <Metric label="In stock" value={it.stock} tone={stockLimited ? "text-low" : ""} />

                  <div className="w-28">
                    <div className="text-[10px] uppercase tracking-wider text-faint font-medium mb-1.5">Dispatch now</div>
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
                          className="w-full bg-bg border border-line rounded-lg px-2 h-9 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
                          aria-label={`Dispatch quantity for ${it.name}, max ${max}`}
                        />
                        <div className="text-[10px] text-faint mt-1">
                          max {max}
                          {stockLimited && <span className="text-low font-medium"> · stock-limited</span>}
                        </div>
                      </>
                    ) : (
                      <div className={`text-sm font-medium ${remaining === 0 ? "text-in" : "text-faint"}`}>
                        {remaining === 0 ? "✓ done" : "—"}
                      </div>
                    )}
                  </div>
                </div>

                {order.status === "PROCESSING" && shortAfter > 0 && (
                  <div className="grid sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-line-soft animate-fade-in">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-low font-medium mb-1.5">
                        Will remain short · {shortAfter}
                      </div>
                      <select
                        value={line?.reason ?? ""}
                        onChange={(e) => setD(it.id, { reason: e.target.value })}
                        className="w-full bg-bg border border-line rounded-lg px-2 h-9 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none cursor-pointer"
                      >
                        <option value="">Reason (to close)…</option>
                        {reasons.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-faint font-medium mb-1.5">Expected</div>
                      <input
                        type="date"
                        value={line?.eta ?? ""}
                        onChange={(e) => setD(it.id, { eta: e.target.value })}
                        className="w-full bg-bg border border-line rounded-lg px-2 h-9 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-faint font-medium mb-1.5">Remark</div>
                      <input
                        value={line?.remark ?? ""}
                        onChange={(e) => setD(it.id, { remark: e.target.value })}
                        placeholder="Optional"
                        className="w-full bg-bg border border-line rounded-lg px-2 h-9 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="bg-out-soft border border-out/25 text-out text-sm px-4 py-3 rounded-xl animate-scale-in">
              {error}
            </div>
          )}

          {order.status === "PENDING" ? (
            <button
              onClick={start}
              disabled={pending}
              className="h-11 px-6 rounded-xl bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-all duration-200 disabled:opacity-50 cursor-pointer btn-press shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {pending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting…
                </>
              ) : (
                "Start processing"
              )}
            </button>
          ) : (
            <div className="flex gap-3 flex-wrap items-center">
              <button
                onClick={() => dispatch(false)}
                disabled={pending || draftTotal === 0 || draftTotal === totalRemaining}
                className="h-11 px-5 rounded-xl border-2 border-velvet text-velvet text-sm font-semibold hover:bg-velvet-soft transition-all duration-200 disabled:opacity-30 cursor-pointer btn-press"
              >
                Dispatch {draftTotal} now — keep open
              </button>
              {confirmClose ? (
                <button
                  onClick={() => dispatch(true)}
                  disabled={pending}
                  onBlur={() => setConfirmClose(false)}
                  className="h-11 px-5 rounded-xl bg-plum text-on-velvet text-sm font-semibold cursor-pointer btn-press shadow-md animate-scale-in"
                >
                  Confirm — settle order
                </button>
              ) : (
                <button
                  onClick={() => setConfirmClose(true)}
                  className="h-11 px-5 rounded-xl bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-all duration-200 cursor-pointer btn-press shadow-sm hover:shadow-md"
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
      <div className="text-[10px] uppercase tracking-wider text-faint font-medium mb-1">{label}</div>
      <div className={`text-sm tabular-nums font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
