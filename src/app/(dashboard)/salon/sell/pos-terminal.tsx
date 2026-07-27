"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { lineGst, billTotals } from "@/lib/gst";
import { PAYMENT_MODES, PAYMENT_MODE_LABEL, type PaymentModeValue } from "@/lib/constants";
import { recordSale } from "@/lib/actions/sales";

export type Sellable = {
  productId: string;
  name: string;
  brand: string;
  unit: string;
  category: string;
  retailPriceCents: number;
  gstRate: number;
  hsn: string | null;
  onHand: number;
};

/** Per-unit price the customer pays, GST included — for the product card. */
function inclusive(p: Sellable): number {
  return lineGst(p.retailPriceCents, 1, p.gstRate).totalCents;
}

export function PosTerminal({ items }: { items: Sellable[] }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(items.map((i) => [i.productId, i])), [items]);

  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentModeValue>("CASH");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const q = search.trim().toLowerCase();
  const shown = q
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.brand.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
      )
    : items;

  function setQty(productId: string, qty: number) {
    setError("");
    setCart((prev) => {
      const next = new Map(prev);
      const cap = byId.get(productId)?.onHand ?? 0;
      const clamped = Math.max(0, Math.min(qty, cap));
      if (clamped === 0) next.delete(productId);
      else next.set(productId, clamped);
      return next;
    });
  }

  const add = (productId: string) => setQty(productId, (cart.get(productId) ?? 0) + 1);

  const lines = [...cart.entries()].map(([productId, qty]) => {
    const p = byId.get(productId)!;
    const g = lineGst(p.retailPriceCents, qty, p.gstRate);
    return { p, qty, ...g };
  });
  const totals = billTotals(lines.map((l) => ({ unitPriceCents: l.p.retailPriceCents, qty: l.qty, gstRate: l.p.gstRate })));
  const unitCount = lines.reduce((s, l) => s + l.qty, 0);

  function complete() {
    if (lines.length === 0) return;
    setError("");
    startTransition(async () => {
      const res = await recordSale({
        lines: lines.map((l) => ({ productId: l.p.productId, qty: l.qty })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMode,
      });
      if (res.ok) router.push(`/salon/bills/${res.saleId}?new=1`);
      else setError(res.error);
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Sell to a customer</h1>
      <p className="text-muted text-sm mt-1">
        Pick products from your shelf, take the customer’s details, and raise a GST bill.
      </p>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5 mt-5 items-start">
        {/* Product picker */}
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your shelf…"
            className="w-full bg-surface border border-line rounded-lg px-4 h-11 text-sm text-ink focus:border-velvet outline-none transition-colors"
          />
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
            {shown.map((p) => {
              const inCart = cart.get(p.productId) ?? 0;
              const soldOut = inCart >= p.onHand;
              return (
                <button
                  key={p.productId}
                  onClick={() => add(p.productId)}
                  disabled={soldOut}
                  className={`text-left bg-surface border rounded-xl p-3.5 transition-colors ${
                    inCart > 0 ? "border-velvet" : "border-line hover:border-velvet/40"
                  } ${soldOut ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{p.name}</div>
                      <div className="text-xs text-faint truncate">{p.brand}</div>
                    </div>
                    {inCart > 0 && (
                      <span className="shrink-0 min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-velvet text-on-velvet text-[11px] font-bold">
                        {inCart}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="font-semibold text-sm tabular-nums">{formatMoney(inclusive(p))}</span>
                    <span className="text-[11px] text-faint">{p.onHand} on shelf</span>
                  </div>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="text-muted text-sm col-span-full py-8 text-center">Nothing matches “{search}”.</p>
            )}
          </div>
        </div>

        {/* Bill */}
        <div className="bg-surface border border-line rounded-xl p-4 lg:sticky lg:top-6">
          <div className="font-semibold text-sm mb-3">
            Current bill{unitCount > 0 ? ` · ${unitCount} unit${unitCount === 1 ? "" : "s"}` : ""}
          </div>

          {lines.length === 0 ? (
            <p className="text-muted text-sm py-6 text-center">Tap products to add them here.</p>
          ) : (
            <div className="space-y-2.5 max-h-[38vh] overflow-y-auto -mx-1 px-1">
              {lines.map((l) => (
                <div key={l.p.productId} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{l.p.name}</div>
                    <div className="text-[11px] text-faint tabular-nums">
                      {formatMoney(l.p.retailPriceCents)} + {l.p.gstRate}% GST
                    </div>
                  </div>
                  <Stepper
                    value={l.qty}
                    max={l.p.onHand}
                    onChange={(n) => setQty(l.p.productId, n)}
                  />
                  <div className="w-20 text-right text-sm tabular-nums shrink-0">{formatMoney(l.totalCents)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-line mt-3 pt-3 space-y-1.5 text-sm">
            <Row label="Taxable value" value={formatMoney(totals.subtotalCents)} />
            <Row label="GST" value={formatMoney(totals.taxCents)} />
            <div className="flex justify-between font-semibold text-base pt-1">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totals.totalCents)}</span>
            </div>
          </div>

          <div className="border-t border-line mt-3 pt-3 space-y-2.5">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full bg-bg border border-line rounded-lg px-3 h-9 text-sm focus:border-velvet outline-none"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone (optional)"
              inputMode="tel"
              className="w-full bg-bg border border-line rounded-lg px-3 h-9 text-sm focus:border-velvet outline-none"
            />
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMode(m)}
                  className={`h-9 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    paymentMode === m
                      ? "bg-velvet text-on-velvet border-velvet"
                      : "border-line text-muted hover:text-ink"
                  }`}
                >
                  {PAYMENT_MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-out text-xs mt-3">{error}</p>}

          <button
            onClick={complete}
            disabled={pending || lines.length === 0}
            className="mt-3 w-full h-11 rounded-lg bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
          >
            {pending ? "Saving…" : `Complete sale · ${formatMoney(totals.totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center border border-line rounded-lg h-8 shrink-0">
      <button
        onClick={() => onChange(value - 1)}
        className="w-7 h-full grid place-items-center text-muted hover:text-ink cursor-pointer"
        aria-label="Less"
      >
        −
      </button>
      <span className="w-7 text-center text-sm tabular-nums">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="w-7 h-full grid place-items-center text-muted hover:text-ink disabled:opacity-40 cursor-pointer"
        aria-label="More"
      >
        +
      </button>
    </div>
  );
}
