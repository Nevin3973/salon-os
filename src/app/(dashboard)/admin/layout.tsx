import { requireSession, activeOrgName } from "@/lib/tenant";
import { OpsShell } from "@/components/ops-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("SUPER_ADMIN");
  const orgName = await activeOrgName();

  return (
    <div className="theme-analytics bg-bg text-ink min-h-screen">
      <OpsShell
        brand="Salon OS"
        subtitle="Head office"
        userName={session.name}
        orgName={orgName}
        items={[
          { label: "Overview", href: "/admin/overview", icon: "gauge" },
          { label: "Products", href: "/admin/products", icon: "tag" },
          { label: "Users & salons", href: "/admin/users", icon: "users" },
          { label: "Auth codes", href: "/admin/codes", icon: "key" },
          { label: "Audit log", href: "/admin/audit", icon: "shield" },
        ]}
      >
        {children}
      </OpsShell>
    </div>
  );
}
