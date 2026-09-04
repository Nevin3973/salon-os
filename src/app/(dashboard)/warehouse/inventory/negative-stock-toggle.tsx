"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setNegativeStock } from "@/lib/actions/inventory";

/**
 * The warehouse's own switch for dispatching stock it does not hold.
 *
 * Turning it ON is the consequential direction, so that is the one that asks
 * for confirmation: from then on a dispatch stops being capped by the shelf
 * count, and a miscount shows up as a negative balance rather than as a
 * refused dispatch. Turning it off again needs no ceremony.
 */
export function NegativeStockToggle({ allowed }: { allowed: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(allowed);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  async function apply(next: boolean) {
    const previous = on;
    setOn(next);
    setConfirming(false);
    setBusy(true);
    setError("");
    const res = await setNegativeStock({ allow: next });
    setBusy(false);
    if (!res.ok) {
      setOn(previous);
      setError(res.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="glass-surface rounded-xl px-4 py-3 mt-4">
      <div className="flex items-start gap-3">
        <input
          id="negative-stock"
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={() => (on ? apply(false) : setConfirming(true))}
          className="mt-0.5 w-4 h-4 accent-[var(--color-velvet)] cursor-pointer disabled:cursor-not-allowed shrink-0"
        />
        <label htmlFor="negative-stock" className="min-w-0 cursor-pointer select-none">
          <span className="block text-sm font-medium text-ink">
            Allow dispatching stock you don&rsquo;t hold
          </span>
          <span className="block text-xs text-muted mt-0.5 leading-relaxed">
            Lets a branch be supplied before the purchase is booked. The balance goes negative in the
            movement log until the paperwork catches up. Off means a dispatch is capped at what is on
            the shelf.
          </span>
        </label>
      </div>

      {confirming && (
        <div className="mt-3 border-t border-line-soft pt-3">
          <p className="text-sm text-ink">
            Turn this on? Stock counts will be able to fall below zero, so a miscount will show as a
            negative balance instead of stopping a dispatch.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => apply(true)}
              disabled={busy}
              className="h-9 px-4 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
            >
              Allow it
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="h-9 px-4 rounded-[6px] border border-line text-sm font-medium hover:border-velvet transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-out text-sm mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
