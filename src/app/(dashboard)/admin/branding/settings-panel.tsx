"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrgSettings } from "@/lib/actions/admin";

/**
 * Owner switches that change what a branch is shown and asked.
 *
 * Saved on toggle rather than behind a Save button: there are two of them and
 * no combination is invalid, so a confirmation step would only add a way to
 * lose the change.
 */
export function SettingsPanel({
  showStaffCredit,
  showCostToManager,
}: {
  showStaffCredit: boolean;
  showCostToManager: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState({ showStaffCredit, showCostToManager });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  async function toggle(key: keyof typeof state) {
    const next = { ...state, [key]: !state[key] };
    const previous = state;
    setState(next);
    setBusy(true);
    setError("");
    const res = await setOrgSettings(next);
    setBusy(false);
    if (!res.ok) {
      setState(previous); // put it back rather than show a lie
      setError(res.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className="mt-10 max-w-xl">
      <h2 className="text-base font-semibold">What your salons see</h2>
      <p className="text-muted text-sm mt-1">
        These apply to every branch straight away.
      </p>

      {error && <p className="text-out text-sm mt-3">{error}</p>}

      <div className="mt-4 divide-y divide-line-soft border border-line rounded-xl bg-surface">
        <Row
          label="Ask who the sale is credited to"
          help="Shows the stylist chips on the till. Turn this off if you do not run commission — staff then stop being asked on every bill."
          checked={state.showStaffCredit}
          disabled={busy}
          onChange={() => toggle("showStaffCredit")}
        />
        <Row
          label="Let branch managers see cost and margin"
          help="Off by default. Managers always see the retail price they sell at; what you paid your supplier, and the margin, stay with you."
          checked={state.showCostToManager}
          disabled={busy}
          onChange={() => toggle("showCostToManager")}
        />
      </div>
    </section>
  );
}

function Row({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-4 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 w-4 h-4 accent-[var(--color-velvet)] cursor-pointer disabled:cursor-not-allowed shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted mt-0.5 leading-relaxed">{help}</span>
      </span>
    </label>
  );
}
