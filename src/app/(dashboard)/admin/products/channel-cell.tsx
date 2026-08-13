"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProductChannel } from "@/lib/actions/admin";

/**
 * Which lists a product belongs to. Two independent boxes, because plenty of
 * stock is genuinely both — shampoo is used at the basin and sold off the shelf.
 *
 * Both can be off. That is allowed rather than blocked: an admin part-way
 * through setting a product up should not be forced into a wrong answer. The
 * branch inventory lists such products under "Not yet classified" so they are
 * visible somewhere instead of silently absent from every screen.
 */
export function ChannelCell({
  productId,
  sellRetail,
  salonUse,
}: {
  productId: string;
  sellRetail: boolean;
  salonUse: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState({ sellRetail, salonUse });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  async function toggle(which: "sellRetail" | "salonUse") {
    const next = { ...state, [which]: !state[which] };
    const previous = state;
    setState(next); // optimistic — the box must not lag the click
    setBusy(true);
    setError("");
    const res = await setProductChannel({ productId, ...next });
    setBusy(false);
    if (!res.ok) {
      setState(previous); // put it back rather than show a lie
      setError(res.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-1">
      <Box
        label="Sale"
        checked={state.sellRetail}
        disabled={busy}
        onChange={() => toggle("sellRetail")}
      />
      <Box
        label="Salon use"
        checked={state.salonUse}
        disabled={busy}
        onChange={() => toggle("salonUse")}
      />
      {!state.sellRetail && !state.salonUse && (
        <span className="text-[10px] text-out leading-tight">On no list</span>
      )}
      {error && <span className="text-[10px] text-out leading-tight">{error}</span>}
    </div>
  );
}

function Box({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="w-3.5 h-3.5 accent-[var(--color-velvet)] cursor-pointer disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}
