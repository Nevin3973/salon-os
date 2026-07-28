"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBranchRack } from "@/lib/actions/sales";

/** Inline editor for a product's rack/bin label at this branch. */
export function RackCell({ productId, rackId }: { productId: string; rackId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(rackId ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    setError("");
    startTransition(async () => {
      const res = await setBranchRack({ productId, rackId: value.trim() });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => { setValue(rackId ?? ""); setOpen(true); }}
        className="text-left cursor-pointer group"
        title="Set the rack / bin where this sits"
      >
        {rackId ? (
          <span className="font-medium text-velvet">📍 {rackId}</span>
        ) : (
          <span className="text-xs text-faint group-hover:text-velvet">+ Add rack</span>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
        placeholder="e.g. A-12"
        aria-label="Rack label"
        maxLength={24}
        autoFocus
        className="w-24 h-8 bg-bg border border-line rounded-lg px-2 text-sm outline-none focus:border-velvet"
      />
      <button
        onClick={save}
        disabled={pending}
        className="h-8 px-2.5 rounded-lg bg-velvet text-on-velvet text-xs font-semibold hover:bg-velvet-dark disabled:opacity-50 cursor-pointer"
      >
        {pending ? "…" : "Save"}
      </button>
      <button onClick={() => setOpen(false)} className="h-8 px-1.5 text-xs text-muted hover:text-ink cursor-pointer">✕</button>
      {error && <span className="text-out text-[11px]">{error}</span>}
    </div>
  );
}
