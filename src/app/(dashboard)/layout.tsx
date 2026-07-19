import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Auth boundary for every signed-in area. Visual chrome lives in the
 * per-role layouts (purchase-manager / warehouse / admin).
 *
 * The must-change-password check reads the DB (not the JWT) so it can't be
 * dodged with a stale token, and clears immediately after the change.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.activeOrgId || !session.activeRole) redirect("/select-org");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });
  if (user?.mustChangePassword) redirect("/change-password");

  return <>{children}</>;
}
