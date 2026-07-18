"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { NavItem } from "@/components/top-nav";

export function MobileNav({
  items,
  userName,
  orgName,
}: {
  items: NavItem[];
  userName: string;
  orgName: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);
  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onKey]);

  return (
    <>
      {/* Hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden flex flex-col gap-[5px] p-2 -mr-2 cursor-pointer"
        aria-label="Open navigation menu"
      >
        <span className="block w-5 h-[2px] bg-ink rounded-full transition-transform" />
        <span className="block w-4 h-[2px] bg-ink rounded-full transition-transform" />
        <span className="block w-5 h-[2px] bg-ink rounded-full transition-transform" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/30"
          onClick={() => setOpen(false)}
          style={{ animation: "backdrop-in 200ms ease-out both" }}
        />
      )}

      {/* Drawer */}
      {open && (
        <nav
          className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-surface shadow-lg flex flex-col"
          style={{ animation: "slide-in-right 300ms var(--ease-out) both" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-16 border-b border-line-soft">
            <span className="font-display text-lg font-semibold text-velvet">Menu</span>
            <button
              onClick={() => setOpen(false)}
              className="p-2 -mr-2 text-muted hover:text-ink cursor-pointer"
              aria-label="Close menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="16" y2="16" />
                <line x1="16" y1="4" x2="4" y2="16" />
              </svg>
            </button>
          </div>

          {/* User section */}
          <div className="px-5 py-4 border-b border-line-soft">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-velvet-soft flex items-center justify-center">
                <span className="text-sm font-semibold text-velvet">
                  {userName?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm text-ink truncate">{userName}</div>
                <div className="text-xs text-faint truncate">{orgName}</div>
              </div>
            </div>
          </div>

          {/* Navigation links */}
          <div className="flex-1 overflow-y-auto py-3 px-3">
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm cursor-pointer transition-colors ${
                    isActive
                      ? "bg-velvet-soft text-velvet font-medium"
                      : "text-muted hover:text-ink hover:bg-velvet-soft/50"
                  }`}
                  style={{ minHeight: 44 }}
                >
                  {item.label}
                  {item.badge ? (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-velvet text-on-velvet text-[11px] font-semibold">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          {/* Sign out */}
          <div className="px-3 py-4 border-t border-line-soft">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full px-4 py-3 text-sm text-muted hover:text-out hover:bg-out-soft rounded-lg transition-colors cursor-pointer text-left"
              style={{ minHeight: 44 }}
            >
              Sign out
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
