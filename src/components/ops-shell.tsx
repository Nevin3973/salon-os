"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export type OpsNavItem = {
  label: string;
  href: string;
  badge?: number;
  icon: keyof typeof ICONS;
};

const ICONS = {
  queue: <path d="M3 5h18M3 12h18M3 19h12" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  boxes: (
    <>
      <path d="M3 9l9-5 9 5v10l-9 5-9-5z" />
      <path d="M3 9l9 5 9-5M12 14v10" />
    </>
  ),
  upload: <path d="M12 16V4m0 0L7 9m5-5l5 5M4 20h16" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  gauge: (
    <>
      <path d="M12 15l4-6" />
      <path d="M4 18a9 9 0 1 1 16 0" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12l9-9 9 9-9 9z" opacity="0" />
      <path d="M20.6 13.4L11 3.8a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v5.6c0 .5.2 1 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4.5" />
      <path d="M11.5 10.5L20 2m-4 4l3 3" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />,
} as const;

export function OpsShell({
  brand,
  subtitle,
  items,
  userName,
  orgName,
  children,
}: {
  brand: string;
  subtitle: string;
  items: OpsNavItem[];
  userName: string;
  orgName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "bg-velvet text-on-velvet"
                : "text-muted hover:text-ink hover:bg-velvet-soft"
            }`}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              {ICONS[item.icon]}
            </svg>
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span
                className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold ${
                  active ? "bg-on-velvet/20 text-on-velvet" : "bg-plum text-on-velvet"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="px-4 py-4 border-t border-line">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg bg-velvet text-on-velvet grid place-items-center text-sm font-bold shrink-0">
          {userName.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink truncate">{userName}</div>
          <div className="text-[11px] text-faint truncate">{orgName}</div>
        </div>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mt-3 w-full h-9 rounded-lg border border-line text-xs font-semibold text-muted hover:text-ink hover:border-velvet/40 transition-colors cursor-pointer"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col bg-surface border-r border-line sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-4 border-b border-line">
          <div className="font-display text-xl font-bold text-velvet tracking-tight">{brand}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-faint font-semibold mt-0.5">
            {subtitle}
          </div>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="lg:hidden sticky top-0 z-40 bg-surface border-b border-line flex items-center gap-3 px-4 h-14">
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Menu"
          className="w-9 h-9 grid place-items-center rounded-lg hover:bg-velvet-soft cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
        <span className="font-display text-lg font-bold text-velvet">{brand}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-faint font-semibold">{subtitle}</span>
      </div>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 pt-14">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative bg-surface border-b border-line shadow-lg animate-slide-down">
            {nav}
            {footer}
          </div>
        </div>
      )}

      <div className="min-w-0">
        <main className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1400px] animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
