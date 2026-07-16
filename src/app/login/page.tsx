"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setPending(false);
    if (res?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="font-display text-4xl tracking-[0.2em]">
        AMARA
        <small className="block text-xs tracking-[0.34em] text-gold mt-2 font-sans">
          CENTRAL SUPPLY
        </small>
      </div>

      <form onSubmit={onSubmit} className="mt-14 w-full max-w-sm text-left">
        <label className="block mb-6">
          <span className="block text-[11px] tracking-[0.18em] uppercase text-faint mb-2">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent border-b border-line focus:border-gold outline-none py-2 text-ink"
            placeholder="you@yourcompany.com"
          />
        </label>
        <label className="block mb-2">
          <span className="block text-[11px] tracking-[0.18em] uppercase text-faint mb-2">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent border-b border-line focus:border-gold outline-none py-2 text-ink"
            placeholder="••••••••"
          />
        </label>

        {error && <p className="text-red text-xs mt-4">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-8 w-full rounded-full border border-gold bg-gold text-black py-3 text-xs tracking-[0.12em] uppercase hover:bg-[var(--color-gold-hover)] hover:border-[var(--color-gold-hover)] transition-colors disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
