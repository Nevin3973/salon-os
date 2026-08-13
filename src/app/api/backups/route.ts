import { prisma } from "@/lib/db";
import { z } from "zod";

/**
 * Where the nightly backup job reports what happened.
 *
 * The job posts here on success AND on failure, because the thing that has
 * actually bitten this project is a backup that stopped working silently: the
 * absence of a row is indistinguishable from a job nobody scheduled. A recorded
 * failure is visible in Admin → System within a day; a missing success is only
 * visible if you already suspected something.
 *
 * Authenticated with a single shared secret rather than a user session — the
 * caller is a CI runner with no login. The secret is compared in constant time,
 * and when it is unset the route refuses everything rather than defaulting open.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  source: z.string().min(1).max(40),
  ok: z.boolean(),
  startedAt: z.string().datetime(),
  sizeBytes: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  message: z.string().max(500).nullable().optional(),
  commit: z.string().max(64).nullable().optional(),
});

/** Length-independent comparison, so a wrong token cannot be found byte by byte. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const expected = process.env.BACKUP_REPORT_TOKEN ?? "";
  if (!expected) {
    // Closed by default: an unset secret must not mean "anyone may write".
    return Response.json({ error: "Reporting is not configured." }, { status: 503 });
  }
  const supplied = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secretsMatch(supplied, expected)) {
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid report." },
      { status: 400 }
    );
  }

  const run = await prisma.backupRun.create({
    data: {
      source: parsed.data.source,
      ok: parsed.data.ok,
      startedAt: new Date(parsed.data.startedAt),
      sizeBytes: parsed.data.sizeBytes ?? null,
      message: parsed.data.message ?? null,
      commit: parsed.data.commit ?? null,
    },
  });

  return Response.json({ recorded: run.id }, { status: 201 });
}
