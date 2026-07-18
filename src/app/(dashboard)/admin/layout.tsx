import { requireSession, activeOrgName } from "@/lib/tenant";
import { TopNav } from "@/components/top-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("SUPER_ADMIN");
  const orgName = await activeOrgName();

  return (
    <div className="min-h-screen">
      <TopNav
        subtitle="Admin"
        userName={session.name}
        orgName={orgName}
        items={[
          { label: "Overview", href: "/admin/overview" },
          { label: "Products", href: "/admin/products" },
          { label: "Users", href: "/admin/users" },
          { label: "Codes", href: "/admin/codes" },
          { label: "Audit Log", href: "/admin/audit" },
        ]}
      />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
