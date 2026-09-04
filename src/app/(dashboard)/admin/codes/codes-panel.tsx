"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateAuthCode, revokeAuthCode } from "@/lib/actions/admin";

type CodeRow = {
  id: string;
  label: string;
  scope: string;
  /** Name of the manager it belongs to, or null for a shared branch code. */
  holder: string | null;
  active: boolean;
  created: string;
  revoked: string | null;
};

type Manager = { id: string; name: string; locationId: string | null };

export function CodesPanel({
  codes,
  branches,
  managers,
}: {
  codes: CodeRow[];
  branches: { id: string; name: string }[];
  managers: Manager[];
}) {
  const router = useRouter();
  // Defaults to an org-wide code. Defaulting to the first branch in the list
  // meant a code made without touching this dropdown worked at that one
  // branch only, and failed everywhere else with no clue as to why.
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  // Only offer people who actually work at the chosen branch — a code bound to
  // a manager somewhere else would be refused at use, silently.
  const eligible = managers.filter((m) => !m.locationId || m.locationId === branchId);
  const [issued, setIssued] = useState<{ scope: string; code: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function generate() {
    setError("");
    startTransition(async () => {
      const res = await generateAuthCode({
        locationId: branchId || undefined,
        userId: userId || undefined,
      });
      if (res.ok && res.data) {
        const branch = branches.find((b) => b.id === branchId)?.name ?? "All branches";
        const holder = eligible.find((m) => m.id === userId)?.name;
        setIssued({ scope: holder ? `${holder} · ${branch}` : branch, code: res.data.code });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      await revokeAuthCode({ codeId: id });
      setConfirm(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-5">
      <div className="bg-surface border border-line rounded-[10px] p-5 mb-4 flex items-end gap-3 flex-wrap">
        <label className="block">
          <span className="block text-[11px] font-medium text-faint mb-1.5 uppercase tracking-[0.1em]">
            Branch
          </span>
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setUserId("");
            }}
            className="bg-bg border border-line rounded-[6px] px-3 h-10 text-sm text-ink focus:border-velvet outline-none min-w-[200px]"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-faint mb-1.5 uppercase tracking-[0.1em]">
            Manager
          </span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="bg-bg border border-line rounded-[6px] px-3 h-10 text-sm text-ink focus:border-velvet outline-none min-w-[200px]"
          >
            <option value="">Anyone at this branch</option>
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <button
          onClick={generate}
          disabled={pending}
          className="h-10 px-5 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
        >
          {pending ? "Working…" : "New code"}
        </button>

        {error && <p className="w-full text-out text-sm" role="alert">{error}</p>}

        {issued && (
          <div className="w-full mt-2 border-t border-line-soft pt-3">
            <span className="text-sm text-muted">New code for {issued.scope}: </span>
            <span className="font-mono text-lg tracking-wider select-all">{issued.code}</span>
            <p className="text-faint text-xs mt-1">
              Write it down now — it&rsquo;s never shown again.
            </p>
          </div>
        )}
      </div>

      <div className="bg-surface border border-line rounded-[10px] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-3">Code</th>
              <th className="font-medium px-4 py-3">Works for</th>
              <th className="font-medium px-4 py-3">Belongs to</th>
              <th className="font-medium px-4 py-3">Made on</th>
              <th className="font-medium px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className={`border-t border-line-soft ${c.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 font-mono tracking-wider">{c.label}</td>
                <td className="px-4 py-3 text-muted">{c.scope}</td>
                <td className="px-4 py-3 text-muted">
                  {c.holder ?? <span className="text-faint">Shared</span>}
                </td>
                <td className="px-4 py-3 text-faint text-xs">{c.created}</td>
                <td className="px-4 py-3">
                  <span className={c.active ? "text-in" : "text-faint"}>
                    {c.active ? "Working" : `Revoked ${c.revoked ?? ""}`}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {c.active &&
                    (confirm === c.id ? (
                      <button
                        onClick={() => revoke(c.id)}
                        onBlur={() => setConfirm(null)}
                        disabled={pending}
                        className="text-out text-xs font-semibold cursor-pointer"
                      >
                        Stop this code?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirm(c.id)}
                        className="text-muted hover:text-out text-xs font-medium cursor-pointer"
                      >
                        Revoke
                      </button>
                    ))}
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-faint">
                  No codes yet. Make one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
