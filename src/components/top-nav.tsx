import Link from "next/link";
import { VelvetLogo } from "@/components/velvet-logo";
import { SignOutButton } from "@/app/(dashboard)/sign-out-button";

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
  return (
    <header className="bg-surface border-b border-line sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-8">
        <Link href="/" className="shrink-0">
          <VelvetLogo subtitle={subtitle} />
        </Link>
        <nav className="flex items-center gap-1 flex-wrap">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative px-3 py-2 text-sm text-muted hover:text-ink rounded-md hover:bg-velvet-soft transition-colors"
            >
              {item.label}
              {item.badge ? (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-velvet text-white text-[11px] font-medium">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <div className="text-right leading-tight hidden sm:block">
            <div className="font-medium text-ink">{userName}</div>
            <div className="text-xs text-faint">{orgName}</div>
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
