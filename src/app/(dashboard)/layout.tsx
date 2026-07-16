import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "./sign-out-button";

const NAV: Record<string, { label: string; href: string }[]> = {
  PURCHASE_MANAGER: [
    { label: "Catalogue", href: "/purchase-manager/catalogue" },
    { label: "Orders", href: "/purchase-manager/orders" },
    { label: "Dashboard", href: "/purchase-manager/dashboard" },
  ],
  WAREHOUSE_MANAGER: [
    { label: "Queue", href: "/warehouse/queue" },
    { label: "Outstanding", href: "/warehouse/outstanding" },
    { label: "Inventory", href: "/warehouse/inventory" },
    { label: "Import", href: "/warehouse/import" },
    { label: "Log", href: "/warehouse/log" },
  ],
  SUPER_ADMIN: [
    { label: "Overview", href: "/admin/overview" },
    { label: "Products", href: "/admin/products" },
    { label: "Users", href: "/admin/users" },
    { label: "Codes", href: "/admin/codes" },
    { label: "Audit Log", href: "/admin/audit" },
  ],
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.activeOrgId || !session.activeRole) redirect("/select-org");

  const nav = NAV[session.activeRole] ?? [];
  const org = session.memberships.find((m) => m.orgId === session.activeOrgId);

  return (
    <div className="min-h-screen">
      <header className="max-w-5xl mx-auto px-7 border-b border-line flex items-baseline justify-between py-7 gap-4 flex-wrap">
        <div className="font-display text-xl tracking-[0.14em]">
          AMARA<small className="text-gold tracking-[0.22em] text-[11px] ml-3">{org?.orgName?.toUpperCase()}</small>
        </div>
        <nav className="flex gap-6 flex-wrap items-baseline">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-faint hover:text-ink text-sm tracking-wide">
              {item.label}
            </Link>
          ))}
          <span className="text-faint text-sm">{session.user.name}</span>
          <SignOutButton />
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-7 pb-20">{children}</main>
    </div>
  );
}
