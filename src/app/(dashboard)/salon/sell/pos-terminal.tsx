"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { lineGst, billTotals } from "@/lib/gst";
import { PAYMENT_MODES, PAYMENT_MODE_LABEL, type PaymentModeValue } from "@/lib/constants";
import { recordSale } from "@/lib/actions/sales";

export type Sellable = {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  unit: string;
  category: string;
  retailPriceCents: number;
  gstRate: number;
  hsn: string | null;
  onHand: number;
  rackId: string | null;
};

/** Per-unit price the customer pays, GST included — shown on the tile. */
function inclusive(p: Sellable): number {
  return lineGst(p.retailPriceCents, 1, p.gstRate).totalCents;
}

export function PosTerminal({ items }: { items: Sellable[] }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(items.map((i) => [i.productId, i])), [items]);
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(items.map((i) => i.category))).sort()],
    [items]
  );

  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const searchRef = useRef<HTMLInputElement>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentModeValue>("CASH");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const q = search.trim().toLowerCase();
  const shown = items.filter((i) => {
    if (cat !== "All" && i.category !== cat) return false;
    if (!q) return true;
    return (
      i.name.toLowerCase().includes(q) ||
      i.brand.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q) ||
      (i.rackId?.toLowerCase().includes(q) ?? false) ||
      i.category.toLowerCase().includes(q)
    );
  });

  // Enter adds instantly: an exact SKU match (barcode scanner types SKU + Enter)
  // wins, otherwise the single remaining result. Then clear + refocus to scan on.
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!q) return;
    const exact = items.find((i) => i.sku.toLowerCase() === q);
    const target = exact ?? (shown.length === 1 ? shown[0] : null);
    if (target && (cart.get(target.productId) ?? 0) < target.onHand) {
      add(target.productId);
      setSearch("");
      setCat("All");
      searchRef.current?.focus();
    }
  }

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
    return { p, qty, ...lineGst(p.retailPriceCents, qty, p.gstRate) };
  });
  const totals = billTotals(
    lines.map((l) => ({ unitPriceCents: l.p.retailPriceCents, qty: l.qty, gstRate: l.p.gstRate }))
  );
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
    <div className="-mx-4 sm:-mx-8 -my-6 sm:-my-8">
      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:h-[calc(100vh-0px)]">
        {/* ————— Product picker ————— */}
        <div className="flex flex-col min-h-0 lg:h-full lg:overflow-hidden px-4 sm:px-8 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-xl font-semibold">Sell to a customer</h1>
            <span className="text-xs text-faint">{shown.length} product{shown.length === 1 ? "" : "s"}</span>
          </div>

          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            autoFocus
            placeholder="Search or scan — name, SKU, rack…"
            className="mt-3 w-full bg-surface border border-line rounded-xl px-4 h-12 text-base text-ink focus:border-velvet outline-none transition-colors"
          />

          {/* Category rail — tap to filter fast */}
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1 shrink-0">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`shrink-0 h-10 px-4 rounded-full text-sm font-semibold border transition-colors select-none ${
                  cat === c
                    ? "bg-velvet text-on-velvet border-velvet"
                    : "bg-surface border-line text-muted active:bg-velvet-soft"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Tiles */}
          <div className="mt-3 pb-28 lg:pb-6 lg:overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 auto-rows-min">
            {shown.map((p) => {
              const inCart = cart.get(p.productId) ?? 0;
              const soldOut = inCart >= p.onHand;
              return (
                <button
                  key={p.productId}
                  onClick={() => add(p.productId)}
                  disabled={soldOut}
                  className={`relative text-left bg-surface border rounded-2xl p-3 min-h-[104px] flex flex-col justify-between transition-all select-none active:scale-[0.97] ${
                    inCart > 0 ? "border-velvet ring-2 ring-velvet/20" : "border-line active:border-velvet/50"
                  } ${soldOut ? "opacity-45" : ""}`}
                >
                  {inCart > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-velvet text-on-velvet text-sm font-bold shadow-md">
                      {inCart}
                    </span>
                  )}
                  <div>
                    <div className="font-semibold text-sm leading-tight line-clamp-2">{p.name}</div>
                    <div className="text-xs text-faint mt-0.5 truncate">
                      {p.rackId ? (
                        <span className="text-velvet font-semibold">📍 {p.rackId}</span>
                      ) : (
                        p.brand
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="font-bold text-base tabular-nums">{formatMoney(inclusive(p))}</span>
                    <span
                      className={`text-[11px] tabular-nums ${p.onHand <= 3 ? "text-out font-semibold" : "text-faint"}`}
                    >
                      {p.onHand} left
                    </span>
                  </div>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="text-muted text-sm col-span-full py-12 text-center">Nothing matches — try another category or search.</p>
            )}
          </div>
        </div>

        {/* ————— Bill panel (desktop / tablet) ————— */}
        <aside className="hidden lg:flex flex-col h-full bg-surface border-l border-line">
          <BillPanel
            lines={lines}
            totals={totals}
            unitCount={unitCount}
            setQty={setQty}
            showCustomer={showCustomer}
            setShowCustomer={setShowCustomer}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            paymentMode={paymentMode}
            setPaymentMode={setPaymentMode}
            error={error}
            pending={pending}
            complete={complete}
          />
        </aside>
      </div>

      {/* ————— Mobile: bill as a bottom sheet + sticky charge bar ————— */}
      <MobileCheckout
        lines={lines}
        totals={totals}
        unitCount={unitCount}
        setQty={setQty}
        showCustomer={showCustomer}
        setShowCustomer={setShowCustomer}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        paymentMode={paymentMode}
        setPaymentMode={setPaymentMode}
        error={error}
        pending={pending}
        complete={complete}
      />
    </div>
  );
}

type Line = { p: Sellable; qty: number; netCents: number; taxCents: number; totalCents: number };
type PanelProps = {
  lines: Line[];
  totals: { subtotalCents: number; taxCents: number; totalCents: number };
  unitCount: number;
  setQty: (id: string, qty: number) => void;
  showCustomer: boolean;
  setShowCustomer: (v: boolean) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  paymentMode: PaymentModeValue;
  setPaymentMode: (v: PaymentModeValue) => void;
  error: string;
  pending: boolean;
  complete: () => void;
};

function BillPanel(props: PanelProps) {
  const { lines, totals, unitCount, setQty, showCustomer, setShowCustomer, customerName, setCustomerName,
    customerPhone, setCustomerPhone, paymentMode, setPaymentMode, error, pending, complete } = props;

  return (
    <>
      <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-line shrink-0">
        <span className="font-semibold">Current bill</span>
        <span className="text-sm text-faint tabular-nums">{unitCount} unit{unitCount === 1 ? "" : "s"}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {lines.length === 0 ? (
          <div className="h-full grid place-items-center text-center px-6">
            <p className="text-muted text-sm">Tap products to add them here, then charge the customer.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {lines.map((l) => (
              <BillLine key={l.p.productId} line={l} setQty={setQty} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line px-5 py-4 space-y-3 shrink-0">
        <div className="space-y-1 text-sm">
          <Row label="Taxable" value={formatMoney(totals.subtotalCents)} />
          <Row label="GST" value={formatMoney(totals.taxCents)} />
        </div>

        {showCustomer ? (
          <div className="space-y-2">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name"
              className="w-full bg-bg border border-line rounded-lg px-3 h-10 text-sm focus:border-velvet outline-none" />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" inputMode="tel"
              className="w-full bg-bg border border-line rounded-lg px-3 h-10 text-sm focus:border-velvet outline-none" />
          </div>
        ) : (
          <button onClick={() => setShowCustomer(true)}
            className="text-xs font-semibold text-velvet active:text-velvet-dark">+ Add customer details</button>
        )}

        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_MODES.map((m) => (
            <button key={m} onClick={() => setPaymentMode(m)}
              className={`h-11 rounded-xl text-sm font-bold border transition-colors select-none ${
                paymentMode === m ? "bg-velvet text-on-velvet border-velvet" : "border-line text-muted active:bg-velvet-soft"
              }`}>
              {PAYMENT_MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {error && <p className="text-out text-xs">{error}</p>}

        <button onClick={complete} disabled={pending || lines.length === 0}
          className="w-full h-14 rounded-2xl bg-velvet text-on-velvet font-bold text-lg flex items-center justify-between px-5 transition-all active:scale-[0.98] disabled:opacity-40 select-none">
          <span>{pending ? "Saving…" : "Charge"}</span>
          <span className="tabular-nums">{formatMoney(totals.totalCents)}</span>
        </button>
      </div>
    </>
  );
}

function BillLine({ line, setQty }: { line: Line; setQty: (id: string, qty: number) => void }) {
  return (
    <div className="flex items-center gap-2 bg-bg rounded-xl p-2">
      <div className="min-w-0 flex-1 pl-1">
        <div className="text-sm font-medium truncate">{line.p.name}</div>
        <div className="text-[11px] text-faint tabular-nums">
          {line.p.rackId && <span className="text-velvet font-semibold">📍 {line.p.rackId} · </span>}
          {formatMoney(line.totalCents)}
        </div>
      </div>
      <Stepper value={line.qty} max={line.p.onHand} onChange={(n) => setQty(line.p.productId, n)} />
    </div>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0 select-none">
      <button onClick={() => onChange(value - 1)} aria-label="Less"
        className="w-10 h-10 grid place-items-center rounded-lg bg-surface border border-line text-lg text-muted active:bg-velvet-soft active:scale-95">
        −
      </button>
      <span className="w-8 text-center text-base font-bold tabular-nums">{value}</span>
      <button onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="More"
        className="w-10 h-10 grid place-items-center rounded-lg bg-surface border border-line text-lg text-muted active:bg-velvet-soft active:scale-95 disabled:opacity-30">
        +
      </button>
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

/** On phones the bill lives in a slide-up sheet; a sticky bar keeps the total
 *  and the charge action one tap away at all times. */
function MobileCheckout(props: PanelProps) {
  const { lines, totals, unitCount } = props;
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      {/* Sticky bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line px-3 py-2.5 flex items-center gap-2 no-print">
        <button onClick={() => setOpen(true)} disabled={lines.length === 0}
          className="h-12 px-4 rounded-xl border border-line font-semibold text-sm text-ink disabled:opacity-40 flex items-center gap-2 select-none">
          <span className="min-w-6 h-6 px-1.5 grid place-items-center rounded-full bg-velvet text-on-velvet text-xs font-bold">{unitCount}</span>
          Bill
        </button>
        <button onClick={() => (lines.length ? setOpen(true) : null)} disabled={lines.length === 0}
          className="flex-1 h-12 rounded-xl bg-velvet text-on-velvet font-bold flex items-center justify-between px-4 disabled:opacity-40 select-none active:scale-[0.98] transition-transform">
          <span>Charge</span>
          <span className="tabular-nums">{formatMoney(totals.totalCents)}</span>
        </button>
      </div>

      {/* Sheet */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] flex flex-col bg-surface rounded-t-3xl border-t border-line animate-slide-up">
            <div className="flex justify-center pt-3 pb-1"><span className="w-10 h-1.5 rounded-full bg-line" /></div>
            <BillPanel {...props} />
          </div>
        </div>
      )}
    </div>
  );
}
