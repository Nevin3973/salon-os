"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { MembershipSummary } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  PURCHASE_MANAGER: "Purchase Manager",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  SUPER_ADMIN: "Super Admin",
};

export function SelectOrgList({ memberships }: { memberships: MembershipSummary[] }) {
  const { update } = useSession();
  const router = useRouter();

  async function choose(orgId: string) {
    await update({ orgId });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="grid gap-3 mt-8 w-full max-w-lg" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      {memberships.map((m) => (
        <button
          key={m.orgId}
          onClick={() => choose(m.orgId)}
          className="bg-surface border border-line rounded-xl p-5 text-left hover:border-velvet hover:shadow-[0_2px_16px_rgba(27,22,38,0.08)] transition-all"
        >
          <div className="font-medium">{m.orgName}</div>
          <div className="text-sm text-velvet mt-1">{ROLE_LABEL[m.role] ?? m.role}</div>
          {m.locationName && <div className="text-xs text-faint mt-0.5">{m.locationName}</div>}
        </button>
      ))}
    </div>
  );
}
