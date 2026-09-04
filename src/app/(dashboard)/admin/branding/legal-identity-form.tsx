"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLegalIdentity } from "@/lib/actions/admin";

/**
 * What prints as the seller on the warehouse's inter-branch tax invoice.
 *
 * Behind an explicit Save, unlike the toggles above it: a half-typed GSTIN is a
 * real state a form can be in, and saving on every keystroke would write one.
 */
export function LegalIdentityForm({
  legalName,
  gstin,
  registeredAddress,
}: {
  legalName: string;
  gstin: string;
  registeredAddress: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ legalName, gstin, registeredAddress });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  const dirty =
    form.legalName !== legalName ||
    form.gstin !== gstin ||
    form.registeredAddress !== registeredAddress;

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    const res = await setLegalIdentity(form);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  const field =
    "w-full bg-bg border border-line rounded-[6px] px-3 py-2 text-sm text-ink focus:border-velvet outline-none";

  return (
    <section className="mt-10 max-w-xl">
      <h2 className="text-base font-semibold">Registered identity</h2>
      <p className="text-muted text-sm mt-1 leading-relaxed">
        Printed as the seller on the tax invoice the warehouse raises when it supplies a salon.
        Counter bills to customers do not carry these.
      </p>

      {error && (
        <p className="text-out text-sm mt-3" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 border border-line rounded-xl bg-surface p-4 space-y-4">
        <label className="block">
          <span className="block text-[11px] font-medium text-faint mb-1.5 uppercase tracking-[0.1em]">
            Legal name
          </span>
          <input
            value={form.legalName}
            onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
            placeholder="ATMOSOT WELL CARE BEAUTY SERVICES LLP"
            className={field}
          />
        </label>

        <label className="block">
          <span className="block text-[11px] font-medium text-faint mb-1.5 uppercase tracking-[0.1em]">
            GSTIN
          </span>
          <input
            value={form.gstin}
            onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
            placeholder="32ACFFA3343R1Z9"
            maxLength={15}
            className={`${field} font-mono tracking-wider`}
          />
          <span className="block text-xs text-muted mt-1">
            Leave blank to print the invoice without one.
          </span>
        </label>

        <label className="block">
          <span className="block text-[11px] font-medium text-faint mb-1.5 uppercase tracking-[0.1em]">
            Registered address
          </span>
          <textarea
            value={form.registeredAddress}
            onChange={(e) => setForm((f) => ({ ...f, registeredAddress: e.target.value }))}
            rows={3}
            placeholder={"23/613-1, Fathima Nagar\nEast Fort, Thrissur - 680005"}
            className={`${field} resize-y`}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="h-10 px-5 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {saved && !dirty && <span className="text-in text-sm">Saved</span>}
        </div>
      </div>
    </section>
  );
}
