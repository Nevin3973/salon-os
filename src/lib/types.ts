import type { Role } from "@prisma/client";

export type MembershipSummary = {
  orgId: string;
  orgName: string;
  role: Role;
  locationId: string | null;
  locationName: string | null;
};
