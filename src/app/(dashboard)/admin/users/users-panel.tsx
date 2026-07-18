"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { createUserWithMembership } from "@/lib/actions/admin";
import { fmtDate } from "@/lib/format";

type Member = { id: string; name: string; email: string; role: string; location: string; since: string };
type Loc = { id: string; name: string; type: string };

const inputCls =
  "w-full bg-bg border border-line rounded-[6px] px-3 h-10 text-sm text-ink focus:border-velvet outline-none transition-colors";

export function UsersPanel({ members, locations }: { members: Member[]; locations: Loc[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  return (
    <div className="mt-5">
      <div className="flex justify-end mb-4">
        {!adding && (
          <button
            onClick={() => { setAdding(true); setIssued(null); }}
            className="h-10 px-5 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors cursor-pointer"
          >
            Add person
          </button>
        )}
      </div>

      {issued && (
        <div className="bg-surface border border-velvet/40 rounded-[10px] p-5 mb-4">
          <div className="font-medium">One-time password for {issued.email}</div>
          <div className="font-mono text-lg tracking-wider mt-2 select-all">{issued.password}</div>
          <p className="text-faint text-xs mt-2">
            Share it safely. It works once — they must set their own password at first sign-in.
            You won&rsquo;t see it again after leaving this page.
          </p>
        </div>
      )}

      {adding && (
        <AddUserForm
          locations={locations}
          onDone={(res) => {
            setAdding(false);
            if (res) setIssued(res);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="bg-surface border border-line rounded-[10px] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-3">Name</th>
              <th className="font-medium px-4 py-3">Email</th>
              <th className="font-medium px-4 py-3">Role</th>
              <th className="font-medium px-4 py-3">Location</th>
              <th className="font-medium px-4 py-3">Since</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-line-soft">
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3 text-muted">{m.email}</td>
                <td className="px-4 py-3 text-muted">{m.role}</td>
                <td className="px-4 py-3 text-muted">{m.location}</td>
                <td className="px-4 py-3 text-faint text-xs">{fmtDate(m.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddUserForm({
  locations,
  onDone,
  onCancel,
}: {
  locations: Loc[];
  onDone: (issued: { email: string; password: string } | null) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "PURCHASE_MANAGER" as Role,
    locationId: locations[0]?.id ?? "",
  });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const locationsForRole =
    form.role === "WAREHOUSE_MANAGER"
      ? locations.filter((l) => l.type === "WAREHOUSE")
      : locations.filter((l) => l.type === "BRANCH");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await createUserWithMembership({
        name: form.name,
        email: form.email,
        role: form.role,
        locationId: form.role === "SUPER_ADMIN" ? undefined : form.locationId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(res.data?.tempPassword ? { email: form.email, password: res.data.tempPassword } : null);
    });
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-velvet/40 rounded-[10px] p-5 mb-4">
      <div className="font-medium mb-4">Add a person</div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <L label="Full name">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className={inputCls} />
        </L>
        <L label="Email">
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required className={inputCls} />
        </L>
        <L label="Role">
          <select
            value={form.role}
            onChange={(e) => {
              const role = e.target.value as Role;
              const pool = role === "WAREHOUSE_MANAGER"
                ? locations.filter((l) => l.type === "WAREHOUSE")
                : locations.filter((l) => l.type === "BRANCH");
              setForm((f) => ({ ...f, role, locationId: pool[0]?.id ?? "" }));
            }}
            className={inputCls}
          >
            <option value="PURCHASE_MANAGER">Purchase Manager</option>
            <option value="WAREHOUSE_MANAGER">Warehouse Manager</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </L>
        {form.role !== "SUPER_ADMIN" && (
          <L label={form.role === "WAREHOUSE_MANAGER" ? "Warehouse" : "Branch"}>
            <select
              value={form.locationId}
              onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
              className={inputCls}
            >
              {locationsForRole.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </L>
        )}
      </div>
      {error && <p className="text-out text-sm mt-3">{error}</p>}
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={pending} className="h-10 px-5 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer">
          {pending ? "Adding…" : "Add & get password"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 px-4 rounded-[6px] border border-line text-sm text-muted hover:text-ink transition-colors cursor-pointer">
          Cancel
        </button>
      </div>
    </form>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-faint mb-1.5 uppercase tracking-[0.1em]">{label}</span>
      {children}
    </label>
  );
}
