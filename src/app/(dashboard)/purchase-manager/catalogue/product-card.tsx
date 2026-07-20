"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/actions/cart";
import { formatMoney } from "@/lib/money";
import type { StockState } from "@/lib/stock";

type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  imageUrl?: string | null;
  priceCents: number;
  available: number;
  state: StockState;
};

// Deterministic soft tint per category for the image placeholder.
function tint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 96%)`;
}

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  const isRequirement = product.state === "out";
  const max = isRequirement ? 9999 : Math.max(1, product.available);
  const href = `/purchase-manager/product/${product.id}`;

  function add() {
    startTransition(async () => {
      await addToCart({ productId: product.id, qty });
      setAdded(true);
      router.refresh();
      setTimeout(() => setAdded(false), 1500);
    });
  }

  return (
    <article className="bg-surface border border-line rounded-sm p-3 flex flex-col hover:shadow-md transition-shadow">
      {/* Image */}
      <Link href={href} className="block">
        <div className="h-40 rounded-sm grid place-items-center mb-2.5 bg-white overflow-hidden">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain p-2" />
          ) : (
            <div className="w-full h-full grid place-items-center" style={{ background: tint(product.category) }}>
              <span className="text-4xl font-bold text-velvet/40">{product.brand.charAt(0)}</span>
            </div>
          )}
        </div>
      </Link>

      {/* Title + brand */}
      <Link href={href} className="block group">
        <h3 className="text-sm leading-snug line-clamp-2 min-h-[2.4rem] group-hover:text-velvet group-hover:underline">
          {product.name}
        </h3>
      </Link>
      <div className="text-xs text-muted mt-1">
        <span className="font-medium text-ink">{product.brand}</span> · per {product.unit}
      </div>

      {/* Price */}
      <div className="mt-1.5">
        <span className="text-lg font-semibold text-ink">{formatMoney(product.priceCents)}</span>
        <span className="text-xs text-muted"> / {product.unit}</span>
      </div>

      {/* Availability */}
      <div className="mt-1.5 text-[13px] font-medium">
        {product.state === "in" && (
          <span style={{ color: "var(--color-price)" }}>In stock · {product.available}</span>
        )}
        {product.state === "low" && (
          <span className="text-low">Only {product.available} left</span>
        )}
        {product.state === "out" && <span className="text-out">Out of stock</span>}
      </div>

      {/* Controls */}
      <div className="mt-auto pt-3 flex items-center gap-2">
        <div className="flex items-center border border-line rounded-full shrink-0">
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
          className="flex-1 h-9 rounded-full text-[13px] font-semibold disabled:opacity-60 transition-colors"
          style={
            isRequirement
              ? { background: "var(--color-cta-2)", color: "var(--color-on-cta)" }
              : { background: "var(--color-cta)", color: "var(--color-on-cta)" }
          }
        >
          {added ? "Added ✓" : isRequirement ? "Request" : "Add to cart"}
        </button>
      </div>
    </article>
  );
}
