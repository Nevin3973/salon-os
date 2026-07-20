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
  unit,
}: {
  productId: string;
  available: number;
  state: StockState;
  unit: string;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  const isRequirement = state === "out";
  const max = isRequirement ? 99 : Math.max(1, available);

  function add() {
    startTransition(async () => {
      await addToCart({ productId, qty, note: note.trim() || undefined });
      setAdded(true);
      router.refresh();
    });
  }

  return (
    <div className="border border-line rounded-md p-4 bg-surface">
      {/* Availability */}
      <div className="text-lg font-semibold mb-1">
        {state === "in" && <span style={{ color: "var(--color-price)" }}>In stock</span>}
        {state === "low" && <span className="text-low">Only {available} left</span>}
        {state === "out" && <span className="text-out">Out of stock</span>}
      </div>
      <p className="text-xs text-muted mb-3">
        {isRequirement
          ? "You can still order it — the warehouse ships it when stock arrives."
          : `Ships from the central warehouse · sold per ${unit}.`}
      </p>

      {/* Quantity */}
      <label className="block text-sm mb-3">
        <span className="text-muted">Qty:</span>{" "}
        <select
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="ml-1 border border-line rounded-md bg-white px-2 py-1 text-sm cursor-pointer"
        >
          {Array.from({ length: Math.min(max, 30) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      {/* CTA */}
      {added ? (
        <Link
          href="/purchase-manager/cart"
          className="w-full h-10 rounded-full text-sm font-semibold grid place-items-center mb-2"
          style={{ background: "var(--color-cta)", color: "var(--color-on-cta)" }}
        >
          ✓ Added — Go to cart
        </Link>
      ) : (
        <button
          onClick={add}
          disabled={pending}
          className="w-full h-10 rounded-full text-sm font-semibold disabled:opacity-60 mb-2 transition-colors"
          style={
            isRequirement
              ? { background: "var(--color-cta-2)", color: "var(--color-on-cta)" }
              : { background: "var(--color-cta)", color: "var(--color-on-cta)" }
          }
        >
          {pending ? "Adding…" : isRequirement ? "Place requirement" : "Add to cart"}
        </button>
      )}

      {/* Note */}
      <label className="block mt-3">
        <span className="block text-xs font-medium text-muted mb-1">Note for the warehouse (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Shade, urgency…"
          className="w-full bg-white border border-line rounded-md px-3 h-9 text-sm focus:border-velvet outline-none"
        />
      </label>

      <div className="border-t border-line mt-4 pt-3 space-y-1.5 text-xs text-muted">
        <div className="flex gap-2"><Dot /> Dispatch tracked end to end</div>
        <div className="flex gap-2"><Dot /> Delivered to your branch address</div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: "var(--color-price)" }} />;
}
