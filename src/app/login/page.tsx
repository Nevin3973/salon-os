"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { VelvetLogo } from "@/components/velvet-logo";

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
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel — animated gradient mesh */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden animate-gradient"
        style={{
          background: "linear-gradient(-45deg, #6d28d9, #7c3aed, #9333ea, #8b5cf6, #6d28d9)",
          backgroundSize: "300% 300%",
        }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-white/5 blur-3xl" />

        <VelvetLogoWhite />
        <div className="animate-slide-up relative z-10" style={{ animationDelay: "200ms" }}>
          <h2 className="font-display text-4xl xl:text-5xl font-bold leading-tight max-w-lg">
            Supply your salons, beautifully.
          </h2>
          <p className="text-white/60 mt-5 max-w-md text-lg leading-relaxed">
            Order supplies, track every dispatch and delivery, and never lose sight of
            what&apos;s pending — all in one place.
          </p>
        </div>
        <p className="text-white/30 text-sm relative z-10">Velvet · Salon Supply Management</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center px-6 py-16 relative">
        {/* Mobile brand accent */}
        <div
          className="lg:hidden absolute top-0 left-0 right-0 h-1.5"
          style={{
            background: "linear-gradient(90deg, #6d28d9, #9333ea, #8b5cf6)",
          }}
        />

        <div className="w-full max-w-sm animate-slide-up">
          <div className="lg:hidden mb-10 flex justify-center">
            <VelvetLogo subtitle="Salon Supply" />
          </div>

          <h1 className="font-display text-3xl font-bold text-ink">Sign in</h1>
          <p className="text-muted text-sm mt-2 leading-relaxed">
            Welcome back. Enter your details to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-8">
            <label className="block mb-5">
              <span className="block text-xs font-semibold text-muted mb-2 uppercase tracking-wider">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-4 h-12 text-sm transition-all duration-200 hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
                placeholder="you@yoursalon.com"
              />
            </label>
            <label className="block mb-2">
              <span className="block text-xs font-semibold text-muted mb-2 uppercase tracking-wider">
                Password
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-4 h-12 text-sm transition-all duration-200 hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <p className="text-out text-sm mt-3 bg-out-soft px-3 py-2 rounded-lg border border-rose-200 animate-scale-in">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-7 w-full h-12 rounded-xl bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-all duration-200 disabled:opacity-50 cursor-pointer btn-press shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              {pending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function VelvetLogoWhite() {
  return (
    <span className="font-display text-2xl font-bold tracking-tight text-white relative z-10 animate-fade-in">
      Velvet
    </span>
  );
}
