"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStaff, updateStaff, setStaffActive } from "@/lib/actions/staff";
import { formatMoney } from "@/lib/money";

export type TeamMember = {
  id: string;
  name: string;
  title: string | null;
  isActive: boolean;
  /** Null when they cover several salons rather than this one. */
  branchId: string | null;
  bills: number;
  revenueCents: number;
};

/**
 * The stylist roster for one salon, with their sales beside each name.
 *
 * Sales sit next to the person on purpose: a roster you can only add to tells
 * you who works here, which the owner already knows. Put the takings beside
 * the name and the same list answers who is actually selling.
 */
export function TeamPanel({
  branchId,
  members,
}: {
  branchId: string;
  members: TeamMember[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const active = members.filter((m) => m.isActive);
  const former = members.filter((m) => !m.isActive);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "That did not work.");
      return false;
    }
    setAdding(false);
    setEditing(null);
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Team</h2>
          <p className="text-muted text-xs mt-0.5">
            Who can be credited with a sale at this salon. Adding someone here does not create a
            login.
          </p>
        </div>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setEditing(null);
          }}
          className="h-9 px-4 rounded-lg bg-velvet text-on-velvet text-xs font-semibold hover:bg-velvet-dark transition-colors cursor-pointer shrink-0"
        >
          {adding ? "Cancel" : "Add person"}
        </button>
      </div>

      {error && <p className="text-out text-sm mt-3">{error}</p>}

      {adding && (
        <Form
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={(name, title) =>
            run(() => createStaff({ name, title, branchId }))
          }
        />
      )}

      <div className="bg-surface border border-line rounded-xl overflow-x-auto mt-3">
        {active.length === 0 && !adding ? (
          <div className="px-4 py-6 text-sm text-muted">
            Nobody on the team yet. Sales here will be credited to the counter until someone is
            added.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                <th className="font-medium px-4 py-3">Name</th>
                <th className="font-medium px-4 py-3">Role</th>
                <th className="font-medium px-4 py-3 text-right">Bills</th>
                <th className="font-medium px-4 py-3 text-right">Revenue</th>
                <th className="font-medium px-4 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {active.map((m) =>
                editing === m.id ? (
                  <tr key={m.id} className="border-t border-line-soft">
                    <td colSpan={5} className="px-4 py-3">
                      <Form
                        busy={busy}
                        initialName={m.name}
                        initialTitle={m.title ?? ""}
                        onCancel={() => setEditing(null)}
                        onSubmit={(name, title) =>
                          run(() =>
                            updateStaff({ staffId: m.id, name, title, branchId: m.branchId })
                          )
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-medium">
                      {m.name}
                      {m.branchId === null && (
                        <span className="text-[10px] text-faint ml-2">covers all salons</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{m.title ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.bills}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(m.revenueCents)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditing(m.id);
                          setAdding(false);
                        }}
                        className="text-xs font-medium text-velvet hover:text-velvet-dark cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => run(() => setStaffActive({ staffId: m.id, isActive: false }))}
                        className="text-xs font-medium text-muted hover:text-out ml-3 cursor-pointer disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {former.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-muted cursor-pointer">
            {former.length} former team {former.length === 1 ? "member" : "members"}
          </summary>
          {/* Kept, never deleted: their name is on every bill they rang up, and
              past sales must go on saying who made them. */}
          <ul className="mt-2 space-y-1">
            {former.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm py-1">
                <span className="text-muted">
                  {m.name}
                  {m.title ? ` · ${m.title}` : ""}
                  <span className="text-faint text-xs ml-2">
                    {m.bills} bills · {formatMoney(m.revenueCents)}
                  </span>
                </span>
                <button
                  disabled={busy}
                  onClick={() => run(() => setStaffActive({ staffId: m.id, isActive: true }))}
                  className="text-xs font-medium text-velvet hover:text-velvet-dark cursor-pointer disabled:opacity-40"
                >
                  Reinstate
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Form({
  busy,
  initialName = "",
  initialTitle = "",
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  initialName?: string;
  initialTitle?: string;
  onCancel: () => void;
  onSubmit: (name: string, title: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState(initialTitle);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name.trim(), title.trim());
      }}
      className="flex flex-wrap items-end gap-2 mt-3"
    >
      <label className="flex-1 min-w-[10rem]">
        <span className="block text-[11px] font-medium text-faint mb-1 uppercase tracking-[0.1em]">
          Name
        </span>
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Divya K."
          className="w-full bg-bg border border-line rounded-[8px] px-3 h-10 text-sm text-ink focus:border-velvet outline-none"
        />
      </label>
      <label className="flex-1 min-w-[10rem]">
        <span className="block text-[11px] font-medium text-faint mb-1 uppercase tracking-[0.1em]">
          Role (optional)
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Senior Stylist"
          className="w-full bg-bg border border-line rounded-[8px] px-3 h-10 text-sm text-ink focus:border-velvet outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={busy || name.trim().length < 2}
        className="h-10 px-4 rounded-lg bg-velvet text-on-velvet text-xs font-semibold disabled:opacity-40 cursor-pointer"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-10 px-3 text-xs text-muted hover:text-ink cursor-pointer"
      >
        Cancel
      </button>
    </form>
  );
}
