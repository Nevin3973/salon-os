"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/actions/cart";
import type { StockState } from "@/lib/stock";

export function BuyPanel({
  productId,
  available,
  state,
}: {
  productId: string;
  available: number;
  state: StockState;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  const isRequirement = state === "out";
  const max = isRequirement ? 9999 : Math.max(1, available);

  function add() {
    startTransition(async () => {
      await addToCart({ productId, qty, note: note.trim() || undefined });
      setAdded(true);
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            state === "in" ? "bg-in" : state === "low" ? "bg-low" : "bg-out"
          }`}
        />
        {state === "out" ? (
          <span className="text-out font-medium">Out of stock — requirement can be placed</span>
        ) : state === "low" ? (
          <span className="text-low font-medium">Low stock · {available} available</span>
        ) : (
          <span className="text-in font-medium">In stock · {available} available</span>
        )}
      </div>

      <div className="flex items-center gap-4 mt-5 flex-wrap">
        <div className="flex items-center border border-line rounded-full h-12 bg-surface">
          <button
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            className="w-11 h-full grid place-items-center text-muted hover:text-ink cursor-pointer text-lg"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-10 text-center font-semibold tabular-nums">{qty}</span>
          <button
            onClick={() => setQty((n) => Math.min(max, n + 1))}
            className="w-11 h-full grid place-items-center text-muted hover:text-ink cursor-pointer text-lg"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        {added ? (
          <Link
            href="/purchase-manager/cart"
            className="flex-1 min-w-[180px] h-12 rounded-full bg-in text-white text-sm font-semibold grid place-items-center hover:opacity-90 transition-opacity"
          >
            Added ✓ — View cart
          </Link>
        ) : (
          <button
            onClick={add}
            disabled={pending}
            className={`flex-1 min-w-[180px] h-12 rounded-full text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer btn-press ${
              isRequirement
                ? "border-2 border-velvet text-velvet hover:bg-velvet-soft"
                : "bg-velvet text-white hover:bg-velvet-dark"
            }`}
          >
            {pending ? "Adding…" : isRequirement ? "Place requirement" : "Add to cart"}
          </button>
        )}
      </div>

      <label className="block mt-5">
        <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">
          Note for the warehouse (optional)
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Shade, urgency, packaging preference…"
          className="w-full bg-surface border border-line rounded-lg px-3.5 h-11 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
        />
      </label>
    </div>
  );
}
