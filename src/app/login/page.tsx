"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

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
      setError("Wrong email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="theme-ops min-h-screen bg-bg text-ink flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="font-display text-3xl text-ink select-none">
            Beyond<span className="text-velvet"> Demands</span>
          </div>
          <p className="text-muted text-sm mt-2">Sign in to your workspace.</p>

          <form onSubmit={onSubmit} className="mt-10">
            <label className="block mb-5">
              <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface border border-line rounded-[10px] px-3.5 h-11 text-sm text-ink focus:border-velvet outline-none transition-colors"
                placeholder="you@salon.com"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
                Password
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-line rounded-[10px] px-3.5 h-11 text-sm text-ink focus:border-velvet outline-none transition-colors"
                placeholder="••••••••"
              />
            </label>

            {error && <p className="text-out text-sm mt-4">{error}</p>}

            <div className="text-right mt-2">
              <Link href="/forgot-password" className="text-xs text-muted hover:text-velvet">
                Forgot your password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="mt-8 w-full h-11 rounded-[10px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
      <p className="text-center text-faint text-xs pb-6">Beyond Demands · by Infynix Growth Solutions</p>
    </div>
  );
}
