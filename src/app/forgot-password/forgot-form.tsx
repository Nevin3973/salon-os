"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/lib/actions/password";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await requestPasswordReset({ email });
      setSent(res.ok ? res.message : res.error);
    });
  }

  if (sent) {
    return (
      <p className="mt-8 text-sm bg-surface border border-line rounded-[10px] p-4 text-muted">
        {sent}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8">
      <label className="block">
        <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
          Email
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@salon.com"
          className="w-full bg-surface border border-line rounded-[10px] px-3.5 h-11 text-sm text-ink focus:border-velvet outline-none transition-colors"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full h-11 rounded-[10px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
