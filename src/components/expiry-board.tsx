"use client";

import { useState, useTransition } from "react";
import { quarantineBatch, returnBatchToWarehouse, writeOffBatch } from "@/lib/actions/batches";
import type { BatchRow } from "@/lib/expiry";

/// Shared expiry board for the warehouse and purchase-manager views.
///
/// The two roles can do different things with the same list, so the actions are
/// passed in rather than inferred: a branch can pull a lot and send it back, but
/// only the warehouse disposes of stock, because a write-off is a financial
/// entry that reaches Tally.

export type ExpiryAction = "quarantine" | "return" | "writeOff";

const REASONS = ["Expired", "Short-dated", "Damaged", "Recalled", "Other"] as const;

function dayLabel(daysLeft: number) {
  if (daysLeft < 0) return `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago`;
  if (daysLeft === 0) return "today";
  return `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

export function ExpiryBoard({
  title,
  blurb,
  rows,
  actions,
  showLocation,
  tone = "neutral",
}: {
  title: string;
  blurb: string;
  rows: BatchRow[];
  actions: ExpiryAction[];
  showLocation: boolean;
  tone?: "neutral" | "warn" | "danger";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("Expired");

  if (rows.length === 0) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not work.");
    });
  };

  const accent =
    tone === "danger" ? "border-l-4 border-l-red-500" : tone === "warn" ? "border-l-4 border-l-amber-500" : "";

  return (
    <section className={`mb-8 ${accent} pl-4`}>
      <h2 className="font-display text-lg font-semibold mb-1">
        {title} <span className="text-muted font-normal">({rows.length})</span>
      </h2>
      <p className="text-muted text-sm mb-3">{blurb}</p>

      {error ? <p className="text-sm text-red-600 mb-3">{error}</p> : null}

      {actions.includes("quarantine") || actions.includes("writeOff") ? (
        <label className="text-sm block mb-3">
          <span className="text-muted mr-2">Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input inline-block w-auto"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-left border-b border-line">
              <th className="py-2 pr-4 font-medium">Product</th>
              <th className="py-2 pr-4 font-medium">Batch</th>
              <th className="py-2 pr-4 font-medium">Expires</th>
              {showLocation ? <th className="py-2 pr-4 font-medium">Location</th> : null}
              <th className="py-2 pr-4 text-right font-medium tabular-nums">Qty</th>
              {actions.length ? <th className="py-2 pl-2 font-medium">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-line/60">
                <td className="py-2 pr-4">
                  <span className="block">{b.productName}</span>
                  <span className="text-muted text-xs">{b.sku}</span>
                </td>
                <td className="py-2 pr-4">{b.batchNo}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <span className="block">{b.expiryDate.toISOString().slice(0, 10)}</span>
                  <span className="text-muted text-xs">{dayLabel(b.daysLeft)}</span>
                </td>
                {showLocation ? (
                  <td className="py-2 pr-4">{b.branchName ?? "Central warehouse"}</td>
                ) : null}
                <td className="py-2 pr-4 text-right tabular-nums">
                  {b.qty} {b.unit}
                </td>
                {actions.length ? (
                  <td className="py-2 pl-2">
                    <div className="flex gap-2 flex-wrap">
                      {actions.includes("quarantine") && b.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="btn btn-sm"
                          onClick={() => run(() => quarantineBatch({ batchId: b.id, reason }))}
                        >
                          Pull from sale
                        </button>
                      ) : null}
                      {actions.includes("return") && b.branchId ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="btn btn-sm"
                          onClick={() => run(() => returnBatchToWarehouse({ batchId: b.id }))}
                        >
                          Send to warehouse
                        </button>
                      ) : null}
                      {actions.includes("writeOff") ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="btn btn-sm"
                          onClick={() => run(() => writeOffBatch({ batchId: b.id, reason }))}
                        >
                          Write off
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
