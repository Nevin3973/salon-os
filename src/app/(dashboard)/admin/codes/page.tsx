import { requireScopedSession } from "@/lib/tenant";
import { fmtDate } from "@/lib/format";
import { CodesPanel } from "./codes-panel";

export default async function AdminCodesPage() {
  const { db } = await requireScopedSession("SUPER_ADMIN");

  const [codes, branches] = await Promise.all([
    db.authorizationCode.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    db.location.findMany({ where: { type: "BRANCH", isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Purchase codes</h1>
      <p className="text-muted text-sm mt-1 max-w-xl">
        A branch needs its code to place an order. Make a new one any time — revoked codes stop
        working right away.
      </p>
      <CodesPanel
        codes={codes.map((c) => ({
          id: c.id,
          label: c.label ?? "••••",
          scope: c.locationId ? branchName.get(c.locationId) ?? "One branch" : "All branches",
          active: c.isActive,
          created: fmtDate(c.createdAt),
          revoked: c.rotatedAt ? fmtDate(c.rotatedAt) : null,
        }))}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
