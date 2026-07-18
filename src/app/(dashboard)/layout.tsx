import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Auth boundary for every signed-in area. Visual chrome lives in the
 * per-role layouts (purchase-manager / warehouse / admin).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.activeOrgId || !session.activeRole) redirect("/select-org");
  return <>{children}</>;
}
