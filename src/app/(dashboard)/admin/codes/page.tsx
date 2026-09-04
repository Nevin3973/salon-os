import { requireScopedSession } from "@/lib/tenant";
import { fmtDate } from "@/lib/format";
import { CodesPanel } from "./codes-panel";

export default async function AdminCodesPage() {
  const { db } = await requireScopedSession("SUPER_ADMIN");

  const [codes, branches, memberships] = await Promise.all([
    db.authorizationCode.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    db.location.findMany({ where: { type: "BRANCH", isActive: true }, orderBy: { name: "asc" } }),
    db.membership.findMany({
      where: { role: "PURCHASE_MANAGER" },
      select: { userId: true, locationId: true, user: { select: { name: true } } },
    }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const holderName = new Map(memberships.map((m) => [m.userId, m.user.name]));
  const managers = memberships
    .map((m) => ({ id: m.userId, name: m.user.name, locationId: m.locationId }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Purchase codes</h1>
      <p className="text-muted text-sm mt-1 max-w-xl">
        A branch needs its code to place an order, void a bill, or correct shelf stock by hand.
        Issue one to a named manager and only they can use it — which is what puts a name against
        the approval in the audit trail. Leave the manager blank for a code the whole branch shares.
        Revoked codes stop working right away.
      </p>
      <CodesPanel
        codes={codes.map((c) => ({
          id: c.id,
          label: c.label ?? "••••",
          scope: c.locationId ? branchName.get(c.locationId) ?? "One branch" : "All branches",
          holder: c.userId ? holderName.get(c.userId) ?? "A manager" : null,
          active: c.isActive,
          created: fmtDate(c.createdAt),
          revoked: c.rotatedAt ? fmtDate(c.rotatedAt) : null,
        }))}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        managers={managers}
      />
    </div>
  );
}
