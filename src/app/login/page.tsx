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
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-velvet text-white">
        <VelvetLogoWhite />
        <div>
          <h2 className="font-display text-4xl font-semibold leading-tight max-w-md">
            Supply your salons, beautifully.
          </h2>
          <p className="text-white/70 mt-4 max-w-md">
            Order supplies, track every dispatch and delivery, and never lose sight of what’s
            pending — all in one place.
          </p>
        </div>
        <p className="text-white/50 text-sm">Velvet · Salon Supply Management</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center">
            <VelvetLogo subtitle="Salon Supply" />
          </div>
          <h1 className="font-display text-2xl font-semibold">Sign in</h1>
          <p className="text-muted text-sm mt-1">Welcome back. Enter your details to continue.</p>

          <form onSubmit={onSubmit} className="mt-8">
            <label className="block mb-5">
              <span className="block text-xs font-medium text-muted mb-1.5">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg px-3 h-11 text-sm focus:border-velvet outline-none"
                placeholder="you@yoursalon.com"
              />
            </label>
            <label className="block mb-2">
              <span className="block text-xs font-medium text-muted mb-1.5">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg px-3 h-11 text-sm focus:border-velvet outline-none"
                placeholder="••••••••"
              />
            </label>

            {error && <p className="text-out text-sm mt-3">{error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="mt-6 w-full h-11 rounded-lg bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-60"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function VelvetLogoWhite() {
  return (
    <span className="font-display text-2xl font-semibold tracking-tight text-white">Velvet</span>
  );
}
