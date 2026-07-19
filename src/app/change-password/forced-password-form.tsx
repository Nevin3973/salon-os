"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/lib/actions/account";

const inputCls =
  "w-full bg-surface border border-line rounded-[10px] px-3.5 h-11 text-sm text-ink focus:border-velvet outline-none transition-colors";

export function ForcedPasswordForm() {
  const router = useRouter();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.next !== form.confirm) {
      setError("New passwords don't match.");
      return;
    }
    startTransition(async () => {
      const res = await changePassword({ current: form.current, next: form.next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block">
        <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
          One-time password
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
          New password
        </span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={form.next}
          onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
          Repeat new password
        </span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          className={inputCls}
        />
      </label>

      {error && <p className="text-out text-sm">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full h-11 rounded-[10px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
      >
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
