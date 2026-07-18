"use client";

import { useState, useTransition } from "react";
import { changePassword } from "@/lib/actions/account";

const inputCls =
  "w-full bg-bg border border-line rounded-lg px-3.5 h-11 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none";

export function PasswordForm() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (form.next !== form.confirm) {
      setMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    startTransition(async () => {
      const res = await changePassword({ current: form.current, next: form.next });
      if (res.ok) {
        setMsg({ ok: true, text: "Password updated." });
        setForm({ current: "", next: "", confirm: "" });
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-md space-y-4">
      <label className="block">
        <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Current password</span>
        <input
          type="password"
          value={form.current}
          onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
          required
          autoComplete="current-password"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">New password</span>
        <input
          type="password"
          value={form.next}
          onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
          required
          autoComplete="new-password"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Confirm new password</span>
        <input
          type="password"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          required
          autoComplete="new-password"
          className={inputCls}
        />
      </label>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-in" : "text-out"} animate-scale-in`}>{msg.text}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 px-7 rounded-lg bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer btn-press"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
