"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fulfilOutstanding } from "@/lib/actions/inventory";

export type OutstandingRow = {
  orderItemId: string;
  orderCode: string;
  branchName: string;
  productName: string;
  owed: number;
  stock: number;
  reason: string | null;
  eta: string | null;
};

export function OutstandingTable({ rows }: { rows: OutstandingRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  function fulfil(orderItemId: string) {
    setError("");
    setBusy(orderItemId);
    startTransition(async () => {
      const res = await fulfilOutstanding({ orderItemId });
      setBusy(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="glass-surface rounded-xl p-12 text-center animate-scale-in">
        <div className="w-12 h-12 rounded-full bg-in-soft mx-auto mb-4 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-in">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <p className="text-muted font-medium">Nothing outstanding</p>
        <p className="text-faint text-sm mt-1">Every order has been dispatched in full.</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-out-soft border border-out/25 text-out text-sm px-4 py-3 rounded-xl mb-4 animate-scale-in">
          {error}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden sm:block glass-surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line-soft">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Branch</th>
                <th className="px-4 py-3 font-semibold text-right">Owed</th>
                <th className="px-4 py-3 font-semibold text-right">In stock</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold">Expected</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="stagger-children">
              {rows.map((r) => {
                const canFulfil = r.stock >= r.owed;
                return (
                  <tr key={r.orderItemId} className="border-b border-line-soft last:border-0 row-hover animate-slide-up">
                    <td className="px-4 py-3 font-medium">{r.productName}</td>
                    <td className="px-4 py-3 tabular-nums font-mono text-xs text-faint">{r.orderCode}</td>
                    <td className="px-4 py-3 text-muted">{r.branchName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5 text-low font-semibold bg-low-soft px-2 py-0.5 rounded-full text-xs">
                        {r.owed}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.stock}</td>
                    <td className="px-4 py-3 text-muted text-xs">{r.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-muted text-xs">{r.eta ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {canFulfil ? (
                        <button
                          onClick={() => fulfil(r.orderItemId)}
                          disabled={pending}
                          className="px-3.5 py-1.5 bg-velvet text-on-velvet text-xs font-semibold rounded-lg hover:bg-velvet-dark disabled:opacity-40 transition-all duration-200 cursor-pointer btn-press shadow-sm hover:shadow-md"
                        >
                          {busy === r.orderItemId ? (
                            <span className="inline-flex items-center gap-1.5">
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Fulfilling…
                            </span>
                          ) : (
                            `Fulfil ${r.owed}`
                          )}
                        </button>
                      ) : (
                        <span className="text-faint text-xs italic">Awaiting stock</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3 stagger-children">
        {rows.map((r) => {
          const canFulfil = r.stock >= r.owed;
          return (
            <div key={r.orderItemId} className="glass-surface rounded-xl p-4 animate-slide-up">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-ink truncate">{r.productName}</div>
                  <div className="text-xs text-faint mt-0.5">{r.orderCode} · {r.branchName}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-low font-semibold bg-low-soft px-2 py-0.5 rounded-full text-xs shrink-0 ml-2">
                  {r.owed} owed
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-faint mb-0.5">In stock</div>
                  <div className="text-sm font-semibold tabular-nums">{r.stock}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-faint mb-0.5">Reason</div>
                  <div className="text-sm text-muted">{r.reason ?? "—"}</div>
                </div>
              </div>
              <div className="pt-3 border-t border-line-soft">
                {canFulfil ? (
                  <button
                    onClick={() => fulfil(r.orderItemId)}
                    disabled={pending}
                    className="w-full px-4 py-2.5 bg-velvet text-on-velvet text-sm font-semibold rounded-lg hover:bg-velvet-dark disabled:opacity-40 transition-all cursor-pointer btn-press"
                    style={{ minHeight: 44 }}
                  >
                    {busy === r.orderItemId ? "Fulfilling…" : `Fulfil ${r.owed}`}
                  </button>
                ) : (
                  <div className="text-center text-faint text-xs italic py-2">Awaiting stock</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
