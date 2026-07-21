"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPassword } from "@/lib/actions/password";

const inputCls =
  "w-full bg-surface border border-line rounded-[10px] px-3.5 h-11 text-sm text-ink focus:border-velvet outline-none transition-colors";

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    startTransition(async () => {
      const res = await resetPassword({ token, password });
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  }

  if (done) {
    return (
      <div className="mt-8">
        <p className="text-sm bg-surface border border-line rounded-[10px] p-4 text-muted">
          Your password is set. You can sign in now.
        </p>
        <Link
          href="/login"
          className="mt-4 block text-center h-11 leading-[44px] rounded-[10px] bg-velvet text-on-velvet text-sm font-semibold"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block">
        <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
          New password
        </span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
          Repeat password
        </span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
        />
      </label>

      {error && <p className="text-out text-sm">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full h-11 rounded-[10px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
