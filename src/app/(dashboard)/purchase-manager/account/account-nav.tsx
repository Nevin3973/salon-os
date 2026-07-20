"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Profile", href: "/purchase-manager/account", exact: true },
  { label: "Addresses", href: "/purchase-manager/account/addresses" },
  { label: "Security", href: "/purchase-manager/account/security" },
  { label: "My orders", href: "/purchase-manager/orders" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-surface border border-line rounded-xl p-2 md:sticky md:top-6">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3.5 py-2.5 rounded-lg text-sm transition-colors ${
              active
                ? "bg-velvet-soft text-velvet-dark font-semibold"
                : "text-muted hover:text-ink hover:bg-velvet-soft/50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
