"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VelvetLogo } from "@/components/velvet-logo";
import { SignOutButton } from "@/app/(dashboard)/sign-out-button";
import { MobileNav } from "@/components/mobile-nav";

export type NavItem = { label: string; href: string; badge?: number };

export function TopNav({
  subtitle,
  items,
  userName,
  orgName,
}: {
  subtitle: string;
  items: NavItem[];
  userName: string;
  orgName: string;
}) {
  const pathname = usePathname();

  return (
    <header className="glass border-b border-line-soft sticky top-0 z-30 animate-slide-down">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4 sm:gap-8">
        {/* Logo */}
        <Link href="/" className="shrink-0 hover-lift">
          <VelvetLogo subtitle={subtitle} />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3.5 py-2 text-sm rounded-lg cursor-pointer transition-all duration-200 ${
                  isActive
                    ? "text-velvet bg-velvet-soft font-medium"
                    : "text-muted hover:text-ink hover:bg-velvet-soft/50"
                }`}
              >
                {item.label}
                {item.badge ? (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-velvet text-on-velvet text-[11px] font-semibold relative">
                    {item.badge}
                    <span className="absolute inset-0 rounded-full bg-velvet animate-pulse-soft opacity-40" />
                  </span>
                ) : null}
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] bg-velvet rounded-full animate-scale-in" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User info — desktop */}
        <div className="hidden sm:flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="font-medium text-sm text-ink">{userName}</div>
            <div className="text-[11px] text-faint">{orgName}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-velvet-soft flex items-center justify-center">
            <span className="text-xs font-semibold text-velvet">
              {userName?.charAt(0)?.toUpperCase() ?? "?"}
            </span>
          </div>
          <SignOutButton />
        </div>

        {/* Mobile menu button */}
        <MobileNav items={items} userName={userName} orgName={orgName} />
      </div>
    </header>
  );
}
