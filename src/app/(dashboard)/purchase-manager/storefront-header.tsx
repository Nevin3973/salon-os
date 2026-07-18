"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { VelvetLogo } from "@/components/velvet-logo";

export function StorefrontHeader({
  userName,
  orgName,
  branchName,
  cartCount,
}: {
  userName: string;
  orgName: string;
  branchName: string | null;
  cartCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(`/purchase-manager/catalogue${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  const linkCls = (href: string) =>
    `text-sm px-2 py-1 rounded-md transition-colors ${
      pathname.startsWith(href) ? "text-velvet font-medium" : "text-muted hover:text-ink"
    }`;

  return (
    <header className="bg-surface border-b border-line sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
        <Link href="/purchase-manager/catalogue" className="shrink-0">
          <VelvetLogo />
        </Link>

        <form onSubmit={submitSearch} className="flex-1 max-w-xl">
          <div className="flex items-center gap-2 bg-bg border border-line rounded-full px-4 h-10 focus-within:border-velvet transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-faint shrink-0">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products, brands, SKU…"
              className="bg-transparent outline-none text-sm w-full text-ink"
              aria-label="Search products"
            />
          </div>
        </form>

        <nav className="hidden md:flex items-center gap-1 shrink-0">
          <Link href="/purchase-manager/catalogue" className={linkCls("/purchase-manager/catalogue")}>
            Shop
          </Link>
          <Link href="/purchase-manager/orders" className={linkCls("/purchase-manager/orders")}>
            My Orders
          </Link>
          <Link href="/purchase-manager/dashboard" className={linkCls("/purchase-manager/dashboard")}>
            Dashboard
          </Link>
        </nav>

        <Link
          href="/purchase-manager/cart"
          className="relative shrink-0 flex items-center gap-2 px-3 h-10 rounded-full border border-line hover:border-velvet hover:bg-velvet-soft transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-ink">
            <path
              d="M3 3h2l2.4 12.3a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 7H6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="20" r="1.4" fill="currentColor" />
            <circle cx="18" cy="20" r="1.4" fill="currentColor" />
          </svg>
          <span className="text-sm font-medium hidden sm:inline">Cart</span>
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-plum text-white text-[11px] font-semibold">
              {cartCount}
            </span>
          )}
        </Link>

        <div className="shrink-0 group relative">
          <button className="flex items-center gap-2 px-2 h-10 rounded-full hover:bg-velvet-soft transition-colors">
            <span className="w-8 h-8 rounded-full bg-velvet text-white grid place-items-center text-sm font-semibold">
              {userName.charAt(0)}
            </span>
          </button>
          <div className="absolute right-0 top-11 w-56 bg-surface border border-line rounded-xl shadow-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-40">
            <div className="px-3 py-2">
              <div className="font-medium text-sm text-ink">{userName}</div>
              <div className="text-xs text-faint">{orgName}{branchName ? ` · ${branchName}` : ""}</div>
            </div>
            <div className="h-px bg-line my-1" />
            <Link href="/purchase-manager/account" className="block px-3 py-2 text-sm text-muted hover:text-ink hover:bg-velvet-soft rounded-lg">
              Your Account
            </Link>
            <Link href="/purchase-manager/account/addresses" className="block px-3 py-2 text-sm text-muted hover:text-ink hover:bg-velvet-soft rounded-lg">
              Addresses
            </Link>
            <Link href="/purchase-manager/orders" className="block px-3 py-2 text-sm text-muted hover:text-ink hover:bg-velvet-soft rounded-lg">
              My Orders
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full text-left px-3 py-2 text-sm text-muted hover:text-ink hover:bg-velvet-soft rounded-lg"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
