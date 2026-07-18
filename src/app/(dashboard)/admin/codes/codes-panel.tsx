"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateAuthCode, revokeAuthCode } from "@/lib/actions/admin";

type CodeRow = {
  id: string;
  label: string;
  scope: string;
  active: boolean;
  created: string;
  revoked: string | null;
};

export function CodesPanel({
  codes,
  branches,
}: {
  codes: CodeRow[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [issued, setIssued] = useState<{ scope: string; code: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const res = await generateAuthCode({ locationId: branchId || undefined });
      if (res.ok && res.data) {
        const scope = branches.find((b) => b.id === branchId)?.name ?? "All branches";
        setIssued({ scope, code: res.data.code });
        router.refresh();
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
            onChange={(e) => setBranchId(e.target.value)}
            className="bg-bg border border-line rounded-[6px] px-3 h-10 text-sm text-ink focus:border-velvet outline-none min-w-[200px]"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
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
                <td colSpan={5} className="px-4 py-8 text-center text-faint">
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
