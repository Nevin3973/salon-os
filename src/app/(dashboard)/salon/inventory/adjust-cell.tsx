"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustBranchStock } from "@/lib/actions/sales";
import { BRANCH_ADJUST_REASONS } from "@/lib/constants";

export function AdjustCell({ productId, name, onHand }: { productId: string; name: string; onHand: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(onHand));
  const [reason, setReason] = useState<(typeof BRANCH_ADJUST_REASONS)[number]>(BRANCH_ADJUST_REASONS[0]);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      setError("Enter a whole number.");
      return;
    }
    if (!authCode.trim()) {
      setError("Enter the authorization code.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await adjustBranchStock({ productId, newOnHand: n, reason, authCode });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  if (!open) {
    return (
      <div className="text-right">
        <button
          onClick={() => { setValue(String(onHand)); setOpen(true); }}
          className="text-xs font-medium text-muted hover:text-velvet cursor-pointer"
        >
          Adjust
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`New count for ${name}`}
        className="w-16 h-8 bg-bg border border-line rounded-lg px-2 text-sm text-right tabular-nums outline-none focus:border-velvet"
      />
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as (typeof BRANCH_ADJUST_REASONS)[number])}
        className="h-8 bg-bg border border-line rounded-lg px-1.5 text-xs outline-none focus:border-velvet"
      >
        {BRANCH_ADJUST_REASONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <input
        value={authCode}
        onChange={(e) => setAuthCode(e.target.value)}
        placeholder="Auth code"
        aria-label="Authorization code"
        className="w-24 h-8 bg-bg border border-line rounded-lg px-2 text-xs outline-none focus:border-velvet"
      />
      <button
        onClick={save}
        disabled={pending}
        className="h-8 px-2.5 rounded-lg bg-velvet text-on-velvet text-xs font-semibold hover:bg-velvet-dark disabled:opacity-50 cursor-pointer"
      >
        {pending ? "…" : "Save"}
      </button>
      <button onClick={() => setOpen(false)} className="h-8 px-1.5 text-xs text-muted hover:text-ink cursor-pointer">
        ✕
      </button>
      {error && <span className="text-out text-[11px] w-full text-right">{error}</span>}
    </div>
  );
}
