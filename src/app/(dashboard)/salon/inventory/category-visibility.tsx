"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPosCategoryHidden } from "@/lib/actions/sales";

/**
 * Per-branch control over which categories appear on the till.
 *
 * Lives on the inventory page rather than the POS itself: this is a setup
 * decision a manager makes once, not something to fiddle with mid-queue. A
 * cashier cannot reach it at all — changing what the till shows during a shift
 * is exactly the kind of quiet change that makes a day's takings hard to
 * explain afterwards.
 *
 * Optimistic: the chip flips immediately and reverts if the server refuses,
 * because waiting on a round trip to see a toggle move feels broken.
 */
export function CategoryVisibility({
  categories,
  hidden,
}: {
  categories: string[];
  hidden: string[];
}) {
  const router = useRouter();
  const [local, setLocal] = useState<Set<string>>(new Set(hidden));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle(category: string) {
    const willHide = !local.has(category);
    setError("");
    setLocal((prev) => {
      const next = new Set(prev);
      if (willHide) next.add(category);
      else next.delete(category);
      return next;
    });

    startTransition(async () => {
      const res = await setPosCategoryHidden({ category, hidden: willHide });
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
        // Put it back: showing a category as hidden when the server disagreed
        // would leave the manager believing a change that never happened.
        setLocal((prev) => {
          const next = new Set(prev);
          if (willHide) next.delete(category);
          else next.add(category);
          return next;
        });
      }
    });
  }

  if (categories.length === 0) return null;

  return (
    <div className="bg-surface border border-line rounded-[10px] p-4 mt-5">
      <div className="text-sm font-semibold">Show on the till</div>
      <p className="text-xs text-muted mt-0.5">
        Turn off anything this branch never sells, so the counter has less to scroll past. Hidden
        categories stay in your inventory and reports, and a scanned barcode still sells them.
      </p>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {categories.map((c) => {
          const isHidden = local.has(c);
          return (
            <button
              key={c}
              onClick={() => toggle(c)}
              disabled={pending}
              aria-pressed={!isHidden}
              className={`h-9 px-3 rounded-lg text-xs font-semibold border transition-colors select-none disabled:opacity-60 cursor-pointer ${
                isHidden
                  ? "border-line text-faint line-through"
                  : "bg-velvet-soft border-velvet/40 text-velvet"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      {error && <p className="text-out text-xs mt-2">{error}</p>}
    </div>
  );
}
