"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/lib/actions/account";

const inputCls =
  "w-full bg-bg border border-line rounded-lg px-3.5 h-11 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none";

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name, phone });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await updateProfile(form);
      setMsg(res.ok ? { ok: true, text: "Profile saved." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="mt-5 max-w-md space-y-4">
      <label className="block">
        <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Full name</span>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Phone</span>
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="+91 …"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Email</span>
        <input value={email} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
        <span className="block text-[11px] text-faint mt-1.5">
          Email is your sign-in identity — contact your admin to change it.
        </span>
      </label>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-in" : "text-out"} animate-scale-in`}>{msg.text}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 px-7 rounded-lg bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer btn-press"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
