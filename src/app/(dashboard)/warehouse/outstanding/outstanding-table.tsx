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
      <div className="bg-surface border border-line rounded-xl p-10 text-center text-muted">
        Nothing outstanding. Every order has been dispatched in full.
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      {error && <p className="text-out text-sm p-3 border-b border-line">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-faint border-b border-line">
              <th className="p-3 font-medium">Product</th>
              <th className="p-3 font-medium">Order</th>
              <th className="p-3 font-medium">Branch</th>
              <th className="p-3 font-medium text-right">Owed</th>
              <th className="p-3 font-medium text-right">In stock</th>
              <th className="p-3 font-medium">Reason</th>
              <th className="p-3 font-medium">Expected</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const canFulfil = r.stock >= r.owed;
              return (
                <tr key={r.orderItemId} className="border-b border-line last:border-0">
                  <td className="p-3">{r.productName}</td>
                  <td className="p-3 tabular-nums">{r.orderCode}</td>
                  <td className="p-3 text-muted">{r.branchName}</td>
                  <td className="p-3 text-right tabular-nums text-low font-medium">{r.owed}</td>
                  <td className="p-3 text-right tabular-nums">{r.stock}</td>
                  <td className="p-3 text-muted">{r.reason ?? "—"}</td>
                  <td className="p-3 text-muted">{r.eta ?? "—"}</td>
                  <td className="p-3 text-right">
                    {canFulfil ? (
                      <button
                        onClick={() => fulfil(r.orderItemId)}
                        disabled={pending}
                        className="text-velvet hover:text-velvet-dark font-medium disabled:opacity-50"
                      >
                        {busy === r.orderItemId ? "…" : `Fulfil ${r.owed}`}
                      </button>
                    ) : (
                      <span className="text-faint text-xs">Awaiting stock</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
