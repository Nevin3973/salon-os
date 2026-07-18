"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCartQty, setCartNote, removeFromCart } from "@/lib/actions/cart";
import { placeOrder } from "@/lib/actions/orders";

type Line = {
  productId: string;
  name: string;
  brand: string;
  unit: string;
  qty: number;
  note: string;
  available: number;
  isRequirement: boolean;
};

export function CartView({ lines, branchName }: { lines: Line[]; branchName: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"cart" | "auth">("cart");
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  const requirementCount = lines.filter((l) => l.isRequirement).length;

  function update(productId: string, qty: number) {
    startTransition(async () => {
      await setCartQty({ productId, qty });
      router.refresh();
    });
  }
  function remove(productId: string) {
    startTransition(async () => {
      await removeFromCart({ productId });
      router.refresh();
    });
  }
  function saveNote(productId: string, note: string) {
    startTransition(async () => {
      await setCartNote({ productId, note });
      router.refresh();
    });
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await placeOrder({ authCode });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Order confirmation lives on the tracking page; navigating there also
      // refreshes the header cart badge via the layout.
      router.push(`/purchase-manager/orders/${res.orderId}?placed=1`);
    });
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-4">Your order</h1>
        <div className="bg-surface border border-line rounded-xl divide-y divide-line">
          {lines.map((l) => (
            <div key={l.productId} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{l.name}</div>
                  <div className="text-xs text-muted">{l.brand} · per {l.unit}</div>
                  {l.isRequirement && (
                    <div className="text-xs text-low mt-1">
                      Requirement — {l.available > 0 ? `${l.available} in stock now, ` : ""}
                      {l.qty - l.available} to be supplied
                    </div>
                  )}
                </div>
                <div className="flex items-center border border-line rounded-full shrink-0">
                  <button
                    onClick={() => update(l.productId, l.qty - 1)}
                    disabled={pending}
                    className="w-8 h-8 grid place-items-center text-muted hover:text-ink"
                    aria-label="Decrease"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm tabular-nums">{l.qty}</span>
                  <button
                    onClick={() => update(l.productId, l.qty + 1)}
                    disabled={pending}
                    className="w-8 h-8 grid place-items-center text-muted hover:text-ink"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <input
                  defaultValue={l.note}
                  onBlur={(e) => e.target.value !== l.note && saveNote(l.productId, e.target.value)}
                  placeholder="Add a note for the warehouse (shade, urgency…)"
                  className="flex-1 text-xs bg-transparent border-b border-dashed border-line focus:border-velvet outline-none py-1 text-ink"
                />
                <button
                  onClick={() => remove(l.productId)}
                  disabled={pending}
                  className="text-xs text-muted hover:text-out shrink-0"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="bg-surface border border-line rounded-xl p-5 lg:sticky lg:top-20">
        <h2 className="font-medium">Summary</h2>
        <div className="flex justify-between text-sm mt-3">
          <span className="text-muted">Items</span>
          <span>{lines.length}</span>
        </div>
        <div className="flex justify-between text-sm mt-1.5">
          <span className="text-muted">Total units</span>
          <span className="tabular-nums">{totalUnits}</span>
        </div>
        {requirementCount > 0 && (
          <div className="flex justify-between text-sm mt-1.5">
            <span className="text-muted">Requirement lines</span>
            <span className="text-low">{requirementCount}</span>
          </div>
        )}
        {branchName && <div className="text-xs text-faint mt-3">Ordering for {branchName}</div>}

        {step === "cart" && (
          <button
            onClick={() => setStep("auth")}
            className="w-full mt-5 h-11 rounded-full bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors"
          >
            Proceed to checkout
          </button>
        )}

        {step === "auth" && (
          <div className="mt-5">
            <label className="block text-xs uppercase tracking-wide text-muted mb-2">
              Authorization code
            </label>
            <input
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.toUpperCase())}
              placeholder="e.g. ROSE-1234"
              className="w-full bg-bg border border-line rounded-lg px-3 h-11 text-center tracking-[0.2em] font-medium focus:border-velvet outline-none"
              aria-label="Authorization code"
            />
            {error && <p className="text-out text-xs mt-2">{error}</p>}
            <button
              onClick={submit}
              disabled={pending || authCode.trim().length === 0}
              className="w-full mt-3 h-11 rounded-full bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-60"
            >
              {pending ? "Placing…" : "Place order"}
            </button>
            <button
              onClick={() => { setStep("cart"); setError(""); }}
              className="w-full mt-2 text-xs text-muted hover:text-ink"
            >
              Back to cart
            </button>
            <p className="text-[11px] text-faint mt-3">
              Submitting reserves stock for your branch and sends the order to the warehouse.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
