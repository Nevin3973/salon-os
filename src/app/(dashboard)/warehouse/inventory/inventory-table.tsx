"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StockState } from "@/lib/stock";
import { adjustStock, setMinStock } from "@/lib/actions/inventory";

export type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  stock: number;
  reserved: number;
  available: number;
  minStock: number;
  state: StockState;
  active: boolean;
};

const DOT: Record<StockState, string> = { in: "bg-in", low: "bg-low", out: "bg-out" };
const LABEL: Record<StockState, string> = { in: "Available", low: "Low", out: "None available" };

export function InventoryTable({ rows, activeFilter }: { rows: InventoryRow[]; activeFilter: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function adjust(productId: string, delta: number) {
    startTransition(async () => {
      await adjustStock({ productId, delta });
      router.refresh();
    });
  }
  function saveMin(productId: string, minStock: number) {
    startTransition(async () => {
      await setMinStock({ productId, minStock });
      router.refresh();
    });
  }

  const filters = [
    { key: "all", label: "All" },
    { key: "low", label: "Low stock" },
    { key: "out", label: "Out of stock" },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/warehouse/inventory" : `/warehouse/inventory?filter=${f.key}`}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              activeFilter === f.key
                ? "bg-velvet text-white border-velvet"
                : "bg-surface text-muted border-line hover:border-velvet"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-faint border-b border-line">
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium text-right">Stock</th>
                <th className="p-3 font-medium text-right">Reserved</th>
                <th className="p-3 font-medium text-right">Available</th>
                <th className="p-3 font-medium text-right">Min</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-center">Adjust</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${r.active ? "" : "opacity-40"}`}>
                  <td className="p-3 text-xs text-faint tabular-nums">{r.sku}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3 text-right tabular-nums">{r.stock}</td>
                  <td className={`p-3 text-right tabular-nums ${r.reserved > 0 ? "text-copper" : "text-faint"}`}>
                    {r.reserved}
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium">{r.available}</td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      min={0}
                      defaultValue={r.minStock}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        if (v !== r.minStock) saveMin(r.id, v);
                      }}
                      className="w-14 bg-bg border border-line rounded-md px-1.5 h-8 text-right tabular-nums focus:border-velvet outline-none"
                      aria-label={`Minimum stock for ${r.name}`}
                    />
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${DOT[r.state]}`} />
                      {LABEL[r.state]}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => adjust(r.id, -1)}
                        disabled={pending}
                        className="w-7 h-7 rounded-md border border-line text-muted hover:text-ink hover:border-velvet disabled:opacity-50"
                        aria-label={`Decrease stock of ${r.name}`}
                      >
                        −
                      </button>
                      <button
                        onClick={() => adjust(r.id, +1)}
                        disabled={pending}
                        className="w-7 h-7 rounded-md border border-line text-muted hover:text-ink hover:border-velvet disabled:opacity-50"
                        aria-label={`Increase stock of ${r.name}`}
                      >
                        +
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
