import type { Role } from "@prisma/client";
import type { MembershipSummary } from "@/lib/types";

declare module "next-auth" {
  interface User {
    memberships?: MembershipSummary[];
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      mustChangePassword: boolean;
    };
    memberships: MembershipSummary[];
    activeOrgId: string | null;
    activeRole: Role | null;
    activeLocationId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    mustChangePassword: boolean;
    memberships: MembershipSummary[];
    activeOrgId: string | null;
    activeRole: Role | null;
    activeLocationId: string | null;
  }
}
