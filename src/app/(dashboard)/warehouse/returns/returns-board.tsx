"use client";

/**
 * Booking delivered goods back in. Quantities are capped at what the branch
 * actually holds, and the server re-clamps them anyway — the panel is a
 * convenience, never the control. Confirming writes a RETURN row against the
 * order and puts the stock back on the shelf.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { returnOrder } from "@/lib/actions/dispatch";

export type ReturnableItem = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  held: number;
  returnedQty: number;
};

export type ReturnableOrder = {
  id: string;
  code: string;
  branchName: string;
  status: string;
  createdAt: string;
  items: ReturnableItem[];
};

export function ReturnsBoard({ orders, reasons }: { orders: ReturnableOrder[]; reasons: string[] }) {
  if (orders.length === 0) {
    return (
      <div className="glass-surface rounded-xl p-12 text-center">
        <p className="text-muted font-medium">Nothing to return</p>
        <p className="text-faint text-sm mt-1">
          Delivered orders from the last 90 days appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <ReturnCard key={o.id} order={o} reasons={reasons} />
      ))}
    </div>
  );
}

function ReturnCard({ order, reasons }: { order: ReturnableOrder; reasons: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const held = order.items.reduce((s, it) => s + it.held, 0);
  const coming = order.items.reduce((s, it) => s + (qty[it.id] ?? 0), 0);

  function set(item: ReturnableItem, next: number) {
    setQty((q) => ({ ...q, [item.id]: Math.max(0, Math.min(item.held, next)) }));
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await returnOrder({
        orderId: order.id,
        reason,
        note: note || undefined,
        lines: order.items.map((it) => ({ orderItemId: it.id, qty: qty[it.id] ?? 0 })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setQty({});
      setReason("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="glass-surface rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-velvet-soft/20 transition-colors cursor-pointer flex-wrap"
      >
        <span className="font-semibold text-ink">{order.code}</span>
        <span className="text-xs text-faint">
          {order.branchName} · delivered {fmtDate(order.createdAt)}
        </span>
        <span className="text-xs text-muted font-medium">
          {held} unit{held === 1 ? "" : "s"} with the branch
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`ml-auto text-faint transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-line-soft p-4 sm:p-5 space-y-4 animate-fade-in">
          {order.items.map((it) => (
            <div key={it.id} className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="font-medium text-sm text-ink">{it.name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {it.brand} · per {it.unit}
                  {it.returnedQty > 0 && (
                    <span className="text-faint"> · {it.returnedQty} already returned</span>
                  )}
                </div>
              </div>
              <div className="w-16">
                <div className="text-[10px] uppercase tracking-wider text-faint font-medium mb-1">
                  Held
                </div>
                <div className="text-sm tabular-nums font-semibold">{it.held}</div>
              </div>
              <div className="w-28">
                <div className="text-[10px] uppercase tracking-wider text-faint font-medium mb-1.5">
                  Coming back
                </div>
                {it.held > 0 ? (
                  <input
                    type="number"
                    min={0}
                    max={it.held}
                    value={qty[it.id] ?? 0}
                    onChange={(e) => set(it, Number(e.target.value) || 0)}
                    aria-label={`Units of ${it.name} coming back, max ${it.held}`}
                    className="w-full bg-bg border border-line rounded-lg px-2 h-9 text-sm focus:border-velvet outline-none"
                  />
                ) : (
                  <div className="text-sm text-faint">—</div>
                )}
              </div>
            </div>
          ))}

          <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-line-soft">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-bg border border-line rounded-lg px-2 h-9 text-sm focus:border-velvet outline-none cursor-pointer"
            >
              <option value="">Why is it coming back?…</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Note (optional)"
              className="w-full bg-bg border border-line rounded-lg px-2 h-9 text-sm focus:border-velvet outline-none"
            />
          </div>

          {error && (
            <div className="bg-out-soft border border-out/25 text-out text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={submit}
              disabled={pending || coming === 0 || !reason}
              className="h-11 px-5 rounded-xl bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark disabled:opacity-40 transition-all cursor-pointer btn-press"
            >
              {pending ? "Booking in…" : `Book ${coming} unit${coming === 1 ? "" : "s"} back into stock`}
            </button>
            <span className="text-xs text-faint">
              Stock goes back up and the branch is told.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
