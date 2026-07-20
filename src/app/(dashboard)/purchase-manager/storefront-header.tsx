"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";

export function StorefrontHeader({
  userName,
  orgName,
  branchName,
  cartCount,
  categories,
}: {
  userName: string;
  orgName: string;
  branchName: string | null;
  cartCount: number;
  categories: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const activeCat = params.get("cat") ?? "All";

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(`/purchase-manager/catalogue${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  function catHref(cat: string) {
    const p = new URLSearchParams();
    if (cat && cat !== "All") p.set("cat", cat);
    const s = p.toString();
    return `/purchase-manager/catalogue${s ? `?${s}` : ""}`;
  }

  const boxCls =
    "flex items-center gap-1 px-2 h-10 rounded-sm border border-transparent hover:border-white/60 cursor-pointer transition-colors";

  return (
    <header className="relative z-30">
      {/* Row 1 — main dark bar */}
      <div style={{ background: "var(--color-header)" }} className="text-white">
        <div className="max-w-[1500px] mx-auto px-3 sm:px-4 h-[58px] flex items-center gap-2 sm:gap-3">
          {/* Logo */}
          <Link href="/purchase-manager/catalogue" className={`${boxCls} shrink-0`}>
            <span className="text-[22px] font-bold tracking-tight leading-none">
              Beyond<span style={{ color: "var(--color-cta)" }}> Demands</span>
            </span>
          </Link>

          {/* Deliver to */}
          <Link
            href="/purchase-manager/account/addresses"
            className={`${boxCls} hidden md:flex flex-col !items-start leading-tight`}
          >
            <span className="text-[11px] text-white/70">Deliver to</span>
            <span className="text-[13px] font-bold -mt-0.5 max-w-[140px] truncate">
              {branchName ?? orgName}
            </span>
          </Link>

          {/* Search */}
          <form onSubmit={submitSearch} className="flex-1 min-w-0 flex h-10 rounded-md overflow-hidden">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search supplies, brands, SKU…"
              className="flex-1 min-w-0 px-3 text-sm text-ink outline-none bg-white"
              aria-label="Search products"
            />
            <button
              type="submit"
              aria-label="Search"
              className="w-11 grid place-items-center shrink-0"
              style={{ background: "var(--color-cta)", color: "var(--color-on-cta)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          {/* Account */}
          <div className="shrink-0 group relative">
            <button className={`${boxCls} flex-col !items-start leading-tight`}>
              <span className="text-[11px] text-white/70">Hello, {userName.split(" ")[0]}</span>
              <span className="text-[13px] font-bold -mt-0.5 flex items-center gap-1">
                Account
                <svg width="10" height="10" viewBox="0 0 12 12" className="text-white/60">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" />
                </svg>
              </span>
            </button>
            <div className="absolute right-0 top-[54px] w-56 bg-white text-ink border border-line rounded-md shadow-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-40">
              <div className="px-3 py-2">
                <div className="font-semibold text-sm">{userName}</div>
                <div className="text-xs text-faint">{orgName}{branchName ? ` · ${branchName}` : ""}</div>
              </div>
              <div className="h-px bg-line my-1" />
              <Link href="/purchase-manager/account" className="block px-3 py-2 text-sm hover:bg-velvet-soft rounded">Your account</Link>
              <Link href="/purchase-manager/account/addresses" className="block px-3 py-2 text-sm hover:bg-velvet-soft rounded">Addresses</Link>
              <Link href="/purchase-manager/orders" className="block px-3 py-2 text-sm hover:bg-velvet-soft rounded">Your orders</Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full text-left px-3 py-2 text-sm hover:bg-velvet-soft rounded"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Orders */}
          <Link href="/purchase-manager/orders" className={`${boxCls} hidden lg:flex flex-col !items-start leading-tight`}>
            <span className="text-[11px] text-white/70">Returns</span>
            <span className="text-[13px] font-bold -mt-0.5">&amp; Orders</span>
          </Link>

          {/* Cart */}
          <Link href="/purchase-manager/cart" className={`${boxCls} relative`}>
            <div className="relative">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M3 4h2l2.4 11.3a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 7H6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="20" r="1.5" fill="currentColor" />
                <circle cx="18" cy="20" r="1.5" fill="currentColor" />
              </svg>
              {cartCount > 0 && (
                <span
                  className="absolute -top-1.5 left-3 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[11px] font-bold"
                  style={{ background: "var(--color-cta)", color: "var(--color-on-cta)" }}
                >
                  {cartCount}
                </span>
              )}
            </div>
            <span className="text-[13px] font-bold hidden sm:inline">Cart</span>
          </Link>
        </div>
      </div>

      {/* Row 2 — category strip */}
      <div style={{ background: "var(--color-header-accent)" }} className="text-white">
        <div className="max-w-[1500px] mx-auto px-2 sm:px-4 flex items-center gap-1 overflow-x-auto no-scrollbar h-10">
          {["All", ...categories].map((cat) => {
            const on = cat === activeCat;
            return (
              <Link
                key={cat}
                href={catHref(cat)}
                className={`shrink-0 px-2.5 h-8 grid place-items-center text-[13px] rounded-sm border transition-colors ${
                  on ? "border-white/80 font-semibold" : "border-transparent hover:border-white/50 text-white/90"
                }`}
              >
                {cat}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
