"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { ATTRIBUTION, PRODUCT_NAME, PARENT_NAME, WORDMARK } from "@/lib/brand";

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

  // The wordmark lands first, then the rule draws under it, then the tagline.
  // Timings are shared with globals.css by being passed as inline delays here —
  // the letter count is only known at render, so a fixed CSS delay per letter
  // would silently desynchronise if the product were ever renamed.
  const first = [...WORDMARK.first];
  const second = [...WORDMARK.second];
  const step = 0.045;
  const tailDelay = (first.length + second.length) * step;

  return (
    <div className="theme-ops auth-page min-h-screen text-ink">
      {/* Static field of light. Flat colour would leave the glass card with
          nothing to refract, so it would read as a plain grey box. */}
      <div className="auth-field" aria-hidden />

      <div className="relative min-h-screen flex flex-col lg:flex-row lg:items-center lg:justify-center gap-10 lg:gap-24 px-6 py-14 lg:py-0">
        {/* Left: the brand, set large. */}
        <div className="w-full lg:w-auto lg:max-w-lg">
          <h1 className="auth-wordmark font-display select-none">
            {first.map((ch, i) => (
              <span key={`f${i}`} className="auth-letter" style={{ animationDelay: `${i * step}s` }}>
                {ch}
              </span>
            ))}
            <span className="auth-letter" style={{ animationDelay: `${first.length * step}s` }}>
              {" "}
            </span>
            {second.map((ch, i) => (
              <span
                key={`s${i}`}
                className="auth-letter text-velvet"
                style={{ animationDelay: `${(first.length + 1 + i) * step}s` }}
              >
                {ch}
              </span>
            ))}
          </h1>

          <div className="auth-rule" style={{ animationDelay: `${tailDelay + 0.1}s` }} aria-hidden />

          <p
            className="attribution auth-fade text-sm sm:text-base mt-4"
            style={{ animationDelay: `${tailDelay + 0.25}s` }}
          >
            {ATTRIBUTION}
          </p>
          <p
            className="auth-fade text-muted text-sm sm:text-base mt-3 max-w-sm leading-relaxed"
            style={{ animationDelay: `${tailDelay + 0.38}s` }}
          >
            Everything your salon sells, stocks and bills — in one place.
          </p>
        </div>

        {/* Right: the form, on glass. */}
        <div className="w-full max-w-sm lg:w-[26rem] auth-card">
          <div className="glass-card p-7 sm:p-8">
            <h2 className="text-lg font-semibold">Sign in</h2>
            <p className="text-muted text-sm mt-1">Use your workspace email.</p>

            <form onSubmit={onSubmit} className="mt-7">
              <label className="block mb-4">
                <span className="block text-[11px] font-medium text-faint mb-2 uppercase tracking-[0.12em]">
                  Email
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input"
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input"
                  placeholder="••••••••"
                />
              </label>

              {error && (
                <p className="text-out text-sm mt-4" role="alert">
                  {error}
                </p>
              )}

              <div className="text-right mt-2.5">
                <Link href="/forgot-password" className="text-xs text-muted hover:text-velvet transition-colors">
                  Forgot your password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={pending}
                className="mt-7 w-full h-11 rounded-[12px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
              >
                {pending ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs mt-6">
            <span className="text-faint">{PRODUCT_NAME} · </span>
            <span className="attribution">{ATTRIBUTION}</span>
          </p>
        </div>
      </div>

      <HelpSection />
    </div>
  );
}

/** Common questions and how to reach a human. Deliberately short — this sits
 *  under a sign-in form, not on a marketing site. */
function HelpSection() {
  return (
    <section className="relative border-t border-line/60 px-6 py-14">
      <div className="max-w-4xl mx-auto grid gap-10 md:grid-cols-[1fr_auto] md:gap-16">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
            Common questions
          </h2>
          <div className="mt-4 divide-y divide-line/60 border-y border-line/60">
            {FAQS.map((f) => (
              // <details> rather than React state: it is keyboard accessible,
              // works before hydration, and needs no JavaScript at all.
              <details key={f.q} className="group py-3.5">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-sm font-medium marker:hidden">
                  {f.q}
                  <span className="text-faint text-lg leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="text-muted text-sm mt-2 leading-relaxed max-w-prose">{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="md:w-64">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-faint">
            Need help?
          </h2>
          <p className="text-muted text-sm mt-4 leading-relaxed">
            Something not working? Contact {PARENT_NAME}.
          </p>

          <a
            href={`https://wa.me/91${SUPPORT_PHONE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-[12px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.13 15.06l-.3-.18-3.1.82.83-3.02-.2-.31A8.1 8.1 0 0 1 12.04 3.8Zm4.42 10.28c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12s-.62.78-.76.94-.28.18-.52.06a6.6 6.6 0 0 1-1.95-1.2 7.3 7.3 0 0 1-1.35-1.68c-.14-.24 0-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46a.88.88 0 0 0-.64.3 2.68 2.68 0 0 0-.84 2c0 1.17.86 2.3.98 2.46.12.16 1.7 2.6 4.12 3.64.58.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.43-.58 1.63-1.15.2-.56.2-1.05.14-1.15-.06-.1-.22-.16-.46-.28Z" />
            </svg>
            WhatsApp us
          </a>

          <p className="text-sm mt-4">
            <a href={`tel:+91${SUPPORT_PHONE}`} className="text-ink hover:text-velvet transition-colors tabular-nums">
              +91 99959 11173
            </a>
          </p>
          <p className="text-faint text-xs mt-1">Mon–Sat, 9am–7pm IST</p>
        </div>
      </div>
    </section>
  );
}

const SUPPORT_PHONE = "9995911173";

const FAQS = [
  {
    q: "I forgot my password.",
    a: "Use the “Forgot your password?” link above. We email you a link that lets you set a new one; it works once and expires in an hour.",
  },
  {
    q: "What is the purchase code?",
    a: "Your branch needs its own code to place an order with the warehouse. Ask your head office — they can issue a new one at any time, and the old one stops working immediately.",
  },
  {
    q: "A product I need is out of stock.",
    a: "You can still place a requirement for it. The warehouse sees it as a pending supply and sends it when stock arrives, so you do not need to chase anyone.",
  },
  {
    q: "Can I use this on my phone?",
    a: "Head office reporting works on a phone. The counter and the warehouse need a tablet or a computer — their screens are too dense to use safely on a small display.",
  },
];
