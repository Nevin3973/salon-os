import { requireScopedSession } from "@/lib/tenant";
import { UsersPanel } from "./users-panel";

const ROLE_LABEL: Record<string, string> = {
  PURCHASE_MANAGER: "Purchase Manager",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  SUPER_ADMIN: "Super Admin",
};

export default async function AdminUsersPage() {
  const { db } = await requireScopedSession("SUPER_ADMIN");

  const [memberships, locations] = await Promise.all([
    db.membership.findMany({
      include: {
        user: { select: { name: true, email: true, createdAt: true } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.location.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <h1 className="font-display text-3xl">Team</h1>
      <p className="text-muted text-sm mt-1 max-w-xl">
        Everyone with access to this workspace. New people get a one-time password to sign in
        and must change it right away.
      </p>
      <UsersPanel
        members={memberships.map((m) => ({
          id: m.id,
          name: m.user.name,
          email: m.user.email,
          role: ROLE_LABEL[m.role] ?? m.role,
          location: m.location?.name ?? "Head office",
          since: m.user.createdAt.toISOString(),
        }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type }))}
      />
    </div>
  );
}
