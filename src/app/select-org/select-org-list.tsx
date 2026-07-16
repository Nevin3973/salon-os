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
    <div className="grid gap-px bg-line border border-line mt-14 w-full max-w-2xl" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      {memberships.map((m) => (
        <button
          key={m.orgId}
          onClick={() => choose(m.orgId)}
          className="bg-card hover:bg-[#1a1a1a] transition-colors text-left p-8"
        >
          <span className="block text-[11px] tracking-[0.22em] uppercase text-faint">{m.orgName}</span>
          <div className="font-display text-xl mt-2">{ROLE_LABEL[m.role] ?? m.role}</div>
          {m.locationName && <div className="text-faint text-sm mt-1">{m.locationName}</div>}
        </button>
      ))}
    </div>
  );
}
