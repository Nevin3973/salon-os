"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/actions/cart";
import type { StockState } from "@/lib/stock";

type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  available: number;
  state: StockState;
};

const STATE_META: Record<StockState, { label: string; className: string }> = {
  in: { label: "In stock", className: "text-in" },
  low: { label: "Low stock", className: "text-low" },
  out: { label: "Out of stock", className: "text-out" },
};

// Deterministic soft tint per category for the image placeholder.
function tint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 94%)`;
}

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  const meta = STATE_META[product.state];
  const isRequirement = product.state === "out";
  const max = isRequirement ? 9999 : Math.max(1, product.available);

  function add() {
    startTransition(async () => {
      await addToCart({ productId: product.id, qty });
      setAdded(true);
      router.refresh();
      setTimeout(() => setAdded(false), 1400);
    });
  }

  return (
    <article className="bg-surface border border-line rounded-xl p-3 flex flex-col hover:shadow-[0_2px_16px_rgba(27,22,38,0.08)] hover:border-velvet/40 transition-all">
      <Link href={`/purchase-manager/product/${product.id}`} className="block group">
        <div
          className="h-32 rounded-lg grid place-items-center mb-3 group-hover:opacity-90 transition-opacity"
          style={{ background: tint(product.category) }}
        >
          <span className="font-display text-3xl text-velvet/50">{product.brand.charAt(0)}</span>
        </div>

        <div className="text-[11px] tracking-wide text-faint uppercase">{product.sku}</div>
        <h3 className="text-sm font-medium leading-snug mt-0.5 line-clamp-2 min-h-[2.5rem] group-hover:text-velvet transition-colors">
          {product.name}
        </h3>
        <div className="text-xs text-muted mt-0.5">
          {product.brand} · per {product.unit}
        </div>
      </Link>

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
          product.state === "in" ? "bg-in" : product.state === "low" ? "bg-low" : "bg-out"
        }`} />
        <span className={meta.className}>
          {meta.label}
          {product.state !== "out" ? ` · ${product.available}` : ""}
        </span>
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
        <div className="flex items-center border border-line rounded-full">
          <button
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            className="w-7 h-7 grid place-items-center text-muted hover:text-ink"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
          <button
            onClick={() => setQty((n) => Math.min(max, n + 1))}
            className="w-7 h-7 grid place-items-center text-muted hover:text-ink"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button
          onClick={add}
          disabled={pending}
          className={`flex-1 h-8 rounded-full text-xs font-semibold transition-colors disabled:opacity-60 ${
            isRequirement
              ? "border border-velvet text-velvet hover:bg-velvet-soft"
              : "bg-velvet text-white hover:bg-velvet-dark"
          }`}
        >
          {added ? "Added ✓" : isRequirement ? "Request" : "Add"}
        </button>
      </div>
    </article>
  );
}
