"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidSale } from "@/lib/actions/sales";
import { VOID_SALE_REASONS } from "@/lib/constants";

export function InvoiceActions({ saleId, canVoid }: { saleId: string; canVoid: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<(typeof VOID_SALE_REASONS)[number]>(VOID_SALE_REASONS[0]);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function doVoid() {
    setError("");
    startTransition(async () => {
      const res = await voidSale({ saleId, reason, authCode });
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.print()}
        className="h-9 px-4 rounded-lg border border-line text-xs font-semibold text-muted hover:text-ink hover:border-velvet/40 transition-colors cursor-pointer"
      >
        Print / Save PDF
      </button>

      {canVoid && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="h-9 px-4 rounded-lg border border-line text-xs font-semibold text-muted hover:text-out hover:border-out/40 transition-colors cursor-pointer"
        >
          Void bill
        </button>
      )}

      {canVoid && confirming && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as (typeof VOID_SALE_REASONS)[number])}
            className="h-9 bg-surface border border-line rounded-lg px-2 text-xs text-ink outline-none focus:border-velvet"
          >
            {VOID_SALE_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="Authorization code"
            aria-label="Authorization code"
            className="h-9 w-40 bg-surface border border-line rounded-lg px-2.5 text-xs text-ink outline-none focus:border-velvet"
          />
          <button
            onClick={doVoid}
            disabled={pending || !authCode.trim()}
            className="h-9 px-3 rounded-lg bg-out text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {pending ? "Voiding…" : "Confirm void"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="h-9 px-2 text-xs text-muted hover:text-ink cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <span className="text-out text-xs w-full">{error}</span>}
    </div>
  );
}
