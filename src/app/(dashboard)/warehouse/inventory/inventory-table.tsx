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
const STATE_BG: Record<StockState, string> = {
  in: "bg-in-soft text-in",
  low: "bg-low-soft text-low",
  out: "bg-out-soft text-out",
};

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
    { key: "all", label: "All items" },
    { key: "low", label: "Low stock" },
    { key: "out", label: "Out of stock" },
  ];

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/warehouse/inventory" : `/warehouse/inventory?filter=${f.key}`}
            className={`px-4 py-2 rounded-full text-sm font-medium border cursor-pointer transition-all duration-200 btn-press ${
              activeFilter === f.key
                ? "bg-velvet text-on-velvet border-velvet shadow-sm"
                : "bg-surface text-muted border-line hover:border-velvet/40 hover:text-ink hover:shadow-sm"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block glass-surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line-soft">
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold text-right">Stock</th>
                <th className="px-4 py-3 font-semibold text-right">Reserved</th>
                <th className="px-4 py-3 font-semibold text-right">Available</th>
                <th className="px-4 py-3 font-semibold text-right">Min</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-center">Adjust</th>
              </tr>
            </thead>
            <tbody className="stagger-children">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-line-soft last:border-0 row-hover animate-slide-up ${
                    r.active ? "" : "opacity-40"
                  }`}
                >
                  <td className="px-4 py-3 text-xs text-faint tabular-nums font-mono">{r.sku}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.stock}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.reserved > 0 ? "text-copper font-medium" : "text-faint"}`}>
                    {r.reserved}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.available}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min={0}
                      defaultValue={r.minStock}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        if (v !== r.minStock) saveMin(r.id, v);
                      }}
                      className="w-16 bg-bg border border-line rounded-lg px-2 h-9 text-right tabular-nums text-sm transition-all duration-200 hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
                      aria-label={`Minimum stock for ${r.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${STATE_BG[r.state]}`}>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${DOT[r.state]}`} />
                        {r.state === "out" && (
                          <span
                            className="absolute inset-0 rounded-full bg-out"
                            style={{ animation: "pulse-ring 2s cubic-bezier(0,0,0.2,1) infinite" }}
                          />
                        )}
                      </span>
                      {LABEL[r.state]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => adjust(r.id, -1)}
                        disabled={pending}
                        className="w-9 h-9 rounded-lg border border-line text-muted hover:text-ink hover:border-velvet/40 hover:bg-velvet-soft/30 disabled:opacity-40 transition-all duration-200 cursor-pointer btn-press flex items-center justify-center text-base"
                        aria-label={`Decrease stock of ${r.name}`}
                      >
                        −
                      </button>
                      <button
                        onClick={() => adjust(r.id, +1)}
                        disabled={pending}
                        className="w-9 h-9 rounded-lg border border-line text-muted hover:text-ink hover:border-velvet/40 hover:bg-velvet-soft/30 disabled:opacity-40 transition-all duration-200 cursor-pointer btn-press flex items-center justify-center text-base"
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

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3 stagger-children">
        {rows.map((r) => (
          <div
            key={r.id}
            className={`glass-surface rounded-xl p-4 animate-slide-up ${r.active ? "" : "opacity-40"}`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <div className="font-medium text-sm text-ink truncate">{r.name}</div>
                <div className="text-xs text-faint font-mono mt-0.5">{r.sku}</div>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${STATE_BG[r.state]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${DOT[r.state]}`} />
                {LABEL[r.state]}
              </span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-faint mb-0.5">Stock</div>
                <div className="text-sm font-semibold tabular-nums">{r.stock}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-faint mb-0.5">Reserved</div>
                <div className={`text-sm font-semibold tabular-nums ${r.reserved > 0 ? "text-copper" : "text-faint"}`}>{r.reserved}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-faint mb-0.5">Available</div>
                <div className="text-sm font-semibold tabular-nums">{r.available}</div>
              </div>
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between pt-3 border-t border-line-soft">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-faint">Min</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={r.minStock}
                  onBlur={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    if (v !== r.minStock) saveMin(r.id, v);
                  }}
                  className="w-16 bg-bg border border-line rounded-lg px-2 h-9 text-right tabular-nums text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
                  aria-label={`Minimum stock for ${r.name}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjust(r.id, -1)}
                  disabled={pending}
                  className="w-10 h-10 rounded-lg border border-line text-muted hover:text-ink hover:border-velvet/40 hover:bg-velvet-soft/30 disabled:opacity-40 transition-all cursor-pointer btn-press flex items-center justify-center text-lg"
                  aria-label={`Decrease stock of ${r.name}`}
                >
                  −
                </button>
                <button
                  onClick={() => adjust(r.id, +1)}
                  disabled={pending}
                  className="w-10 h-10 rounded-lg border border-line text-muted hover:text-ink hover:border-velvet/40 hover:bg-velvet-soft/30 disabled:opacity-40 transition-all cursor-pointer btn-press flex items-center justify-center text-lg"
                  aria-label={`Increase stock of ${r.name}`}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
