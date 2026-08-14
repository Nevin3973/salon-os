"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireVerifiedScopedSession } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

/**
 * The stylist roster.
 *
 * Staff are NOT logins. Most stylists never sign in — they are people a sale
 * can be credited to, which is what makes commission and "who sells what"
 * answerable. Permissions live on Membership.role; `title` here is a display
 * label and grants nothing. Conflating the two would turn a job title into an
 * access-control decision.
 *
 * Owner-only by deliberate choice: a roster change moves who gets credited for
 * revenue, so it belongs with the person accountable for the money rather than
 * with the branch that benefits from the change.
 */

export type StaffResult = { ok: true } | { ok: false; error: string };

const staffInput = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(80),
  title: z.string().trim().max(40).optional(),
  /** Null = works across several salons. */
  branchId: z.string().min(1).nullable(),
});

/** Confirms a branch belongs to this org before it is written to a row. */
async function assertBranch(
  db: Awaited<ReturnType<typeof requireVerifiedScopedSession>>["db"],
  branchId: string | null
): Promise<boolean> {
  if (!branchId) return true;
  const branch = await db.location.findFirst({ where: { id: branchId, type: "BRANCH" } });
  return Boolean(branch);
}

export async function createStaff(input: {
  name: string;
  title?: string;
  branchId: string | null;
}): Promise<StaffResult> {
  const parsed = staffInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  if (!(await assertBranch(db, parsed.data.branchId))) {
    return { ok: false, error: "That salon does not exist." };
  }

  // Same name at the same salon is almost always a double submit rather than
  // two people, and two rows would split one person's sales between them.
  const clash = await db.staff.findFirst({
    where: { name: parsed.data.name, branchId: parsed.data.branchId, isActive: true },
  });
  if (clash) return { ok: false, error: `${parsed.data.name} is already on this salon's team.` };

  const staff = await db.staff.create({
    data: {
      orgId: session.orgId,
      name: parsed.data.name,
      title: parsed.data.title || null,
      branchId: parsed.data.branchId,
    },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Added ${staff.name} to the team`,
    entityType: "Staff",
    entityId: staff.id,
  });

  revalidatePath("/admin/salons", "layout");
  revalidatePath("/salon/sell");
  return { ok: true };
}

export async function updateStaff(input: {
  staffId: string;
  name: string;
  title?: string;
  branchId: string | null;
}): Promise<StaffResult> {
  const parsed = staffInput.extend({ staffId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const staff = await db.staff.findFirst({ where: { id: parsed.data.staffId } });
  if (!staff) return { ok: false, error: "That person is not on the team." };
  if (!(await assertBranch(db, parsed.data.branchId))) {
    return { ok: false, error: "That salon does not exist." };
  }

  await db.staff.update({
    where: { id: staff.id },
    data: {
      name: parsed.data.name,
      title: parsed.data.title || null,
      branchId: parsed.data.branchId,
    },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Updated ${parsed.data.name}'s details`,
    entityType: "Staff",
    entityId: staff.id,
  });

  revalidatePath("/admin/salons", "layout");
  return { ok: true };
}

/**
 * Takes someone off the roster.
 *
 * Deactivates, never deletes. Their name is stamped on every bill they rang
 * up, and past sales must keep saying who made them — deleting the row would
 * orphan that history and destroy the accountability the roster exists for.
 * They simply stop appearing at the till and in new reports.
 */
export async function setStaffActive(input: {
  staffId: string;
  isActive: boolean;
}): Promise<StaffResult> {
  const parsed = z
    .object({ staffId: z.string().min(1), isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");
  const staff = await db.staff.findFirst({ where: { id: parsed.data.staffId } });
  if (!staff) return { ok: false, error: "That person is not on the team." };

  await db.staff.update({
    where: { id: staff.id },
    data: { isActive: parsed.data.isActive },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `${parsed.data.isActive ? "Reinstated" : "Removed"} ${staff.name} ${
      parsed.data.isActive ? "to" : "from"
    } the team`,
    entityType: "Staff",
    entityId: staff.id,
  });

  revalidatePath("/admin/salons", "layout");
  revalidatePath("/salon/sell");
  return { ok: true };
}
