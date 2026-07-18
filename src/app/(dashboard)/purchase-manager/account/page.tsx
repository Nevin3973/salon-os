import { requireSession, activeOrgName, activeLocationName } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { ProfileForm } from "./profile-form";

export default async function AccountProfilePage() {
  const session = await requireSession("PURCHASE_MANAGER");
  const [user, orgName, branchName] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    activeOrgName(),
    activeLocationName(),
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-line rounded-xl p-6">
        <h2 className="font-semibold text-lg">Profile</h2>
        <p className="text-muted text-sm mt-1">
          Your details as they appear on orders and to the warehouse team.
        </p>
        <ProfileForm
          name={user?.name ?? session.name}
          phone={user?.phone ?? ""}
          email={session.email}
        />
      </div>

      <div className="bg-surface border border-line rounded-xl p-6">
        <h2 className="font-semibold text-lg">Workspace</h2>
        <dl className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-faint text-xs uppercase tracking-wider font-semibold">Organization</dt>
            <dd className="mt-1 font-medium">{orgName}</dd>
          </div>
          <div>
            <dt className="text-faint text-xs uppercase tracking-wider font-semibold">Branch</dt>
            <dd className="mt-1 font-medium">{branchName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-faint text-xs uppercase tracking-wider font-semibold">Role</dt>
            <dd className="mt-1 font-medium">Purchase Manager</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
