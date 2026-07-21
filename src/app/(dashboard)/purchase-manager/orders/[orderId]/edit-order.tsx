"use client";

/**
 * Amend a pending order. Mirrors the cart's editing model — steppers per line,
 * remove to drop a line — and ends with the same authorization code the order
 * was placed with, because an amended order needs the same approval as a new
 * one. Nothing is saved until Save changes: the panel edits local state only,
 * so a mistyped quantity costs nothing.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { updateOrder } from "@/lib/actions/orders";

export type EditableLine = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  qty: number;
  unitPriceCents: number;
};

export type EditableAddress = { id: string; label: string; city: string };

export function EditOrder({
  orderId,
  lines,
  addresses,
  shipToAddressId,
  deliveryNote,
  cartCount,
}: {
  orderId: string;
  lines: EditableLine[];
  addresses: EditableAddress[];
  shipToAddressId: string | null;
  deliveryNote: string | null;
  cartCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, l.qty]))
  );
  const [addressId, setAddressId] = useState(shipToAddressId ?? "");
  const [note, setNote] = useState(deliveryNote ?? "");
  const [mergeCart, setMergeCart] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const remaining = lines.filter((l) => (qty[l.id] ?? 0) > 0);
  const newTotal = remaining.reduce((s, l) => s + l.unitPriceCents * (qty[l.id] ?? 0), 0);
  const originalTotal = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);

  function set(id: string, next: number) {
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(100_000, next)) }));
  }

  function reset() {
    setQty(Object.fromEntries(lines.map((l) => [l.id, l.qty])));
    setAddressId(shipToAddressId ?? "");
    setNote(deliveryNote ?? "");
    setMergeCart(false);
    setAuthCode("");
    setError("");
    setOpen(false);
  }

  function save() {
    setError("");
    startTransition(async () => {
      const result = await updateOrder({
        orderId,
        authCode,
        lines: lines.map((l) => ({ orderItemId: l.id, qty: qty[l.id] ?? 0 })),
        mergeCart: mergeCart && cartCount > 0,
        ...(addressId ? { shipToAddressId: addressId } : {}),
        deliveryNote: note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setAuthCode("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-velvet hover:text-velvet-dark font-medium"
      >
        Edit order
      </button>
    );
  }

  return (
    <div className="w-full mt-4 bg-surface border border-velvet/30 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-medium text-sm">Edit this order</h2>
        <span className="text-xs text-faint">
          The warehouse has not started picking it yet.
        </span>
      </div>

      <div className="divide-y divide-line">
        {lines.map((l) => {
          const q = qty[l.id] ?? 0;
          const dropped = q === 0;
          return (
            <div key={l.id} className="flex items-center gap-3 py-2.5">
              <div className={`flex-1 min-w-0 ${dropped ? "opacity-50 line-through" : ""}`}>
                <div className="text-sm font-medium truncate">{l.name}</div>
                <div className="text-xs text-muted">
                  {l.brand} · {formatMoney(l.unitPriceCents)} per {l.unit}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => set(l.id, q - 1)}
                  aria-label={`One fewer ${l.name}`}
                  className="w-7 h-7 rounded-md border border-line text-muted hover:text-ink hover:border-velvet/40 cursor-pointer"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={q}
                  onChange={(e) => set(l.id, Number(e.target.value))}
                  aria-label={`Quantity of ${l.name}`}
                  className="w-14 h-7 text-center text-sm rounded-md border border-line bg-bg tabular-nums"
                />
                <button
                  onClick={() => set(l.id, q + 1)}
                  aria-label={`One more ${l.name}`}
                  className="w-7 h-7 rounded-md border border-line text-muted hover:text-ink hover:border-velvet/40 cursor-pointer"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => set(l.id, dropped ? l.qty : 0)}
                className="text-xs text-muted hover:text-out w-16 text-right cursor-pointer"
              >
                {dropped ? "Undo" : "Remove"}
              </button>
            </div>
          );
        })}
      </div>

      {cartCount > 0 && (
        <label className="flex items-center gap-2.5 mt-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={mergeCart}
            onChange={(e) => setMergeCart(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-velvet)]"
          />
          <span className="text-muted">
            Also add the {cartCount} item{cartCount === 1 ? "" : "s"} in my cart to this order
          </span>
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <label className="text-xs">
          <span className="block text-faint font-semibold uppercase tracking-wider mb-1">
            Deliver to
          </span>
          <select
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-line bg-bg text-sm text-ink"
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} — {a.city}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-faint font-semibold uppercase tracking-wider mb-1">
            Delivery note
          </span>
          <input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            className="w-full h-9 px-2.5 rounded-lg border border-line bg-bg text-sm text-ink"
          />
        </label>
      </div>

      <div className="flex items-baseline justify-between mt-4 pt-3 border-t border-line text-sm">
        <span className="text-muted">New order total</span>
        <span className="font-semibold">
          {formatMoney(newTotal)}
          {newTotal !== originalTotal && (
            <span className="text-xs text-faint font-normal"> (was {formatMoney(originalTotal)})</span>
          )}
        </span>
      </div>

      {remaining.length === 0 && !mergeCart && (
        <p className="text-xs text-out mt-3">
          An order needs at least one item. To call the whole thing off, cancel it instead.
        </p>
      )}

      <div className="mt-4">
        <label className="text-xs">
          <span className="block text-faint font-semibold uppercase tracking-wider mb-1">
            Authorization code
          </span>
          <input
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            autoComplete="off"
            placeholder="Your branch code"
            className="w-full sm:w-64 h-9 px-2.5 rounded-lg border border-line bg-bg text-sm text-ink"
          />
        </label>
        <p className="text-xs text-faint mt-1.5">
          Changing an order needs the same approval as placing one.
        </p>
      </div>

      {error && <p className="text-sm text-out mt-3">{error}</p>}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={save}
          disabled={pending || !authCode || (remaining.length === 0 && !mergeCart)}
          className="h-9 px-4 rounded-lg bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button onClick={reset} disabled={pending} className="text-sm text-muted hover:text-ink cursor-pointer">
          Discard
        </button>
      </div>
    </div>
  );
}
