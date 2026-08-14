import { requireSession, activeOrgBranding } from "@/lib/tenant";
import { OpsShell } from "@/components/ops-shell";
import { versionLabel } from "@/lib/version";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("SUPER_ADMIN");
  const org = await activeOrgBranding();

  return (
    <div className="theme-analytics bg-bg text-ink min-h-screen">
      <OpsShell
        brand="Salon OS"
        subtitle="Head office"
        userName={session.name}
        orgName={org.name}
        orgLogoUrl={org.logoUrl}
        version={versionLabel()}
        items={[
          { label: "Overview", href: "/admin/overview", icon: "gauge" },
          { label: "Reports", href: "/admin/reports", icon: "chart" },
          { label: "Retail sales", href: "/admin/sales", icon: "receipt" },
          { label: "Salons", href: "/admin/salons", icon: "store" },
          { label: "Products", href: "/admin/products", icon: "tag" },
          { label: "Users & salons", href: "/admin/users", icon: "users" },
          { label: "Branding", href: "/admin/branding", icon: "sparkle" },
          { label: "Auth codes", href: "/admin/codes", icon: "key" },
          { label: "Audit log", href: "/admin/audit", icon: "shield" },
        ]}
      >
        {children}
      </OpsShell>
    </div>
  );
}
