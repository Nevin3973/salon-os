/**
 * Fails the build if any tenant table is missing forced row-level security.
 *
 * The tenancy wall is only as good as its weakest table, and a table that
 * ships without a policy fails silently — queries simply return everything.
 * That is the worst possible failure mode for a security control, so this
 * asserts coverage rather than trusting that whoever added the table also
 * remembered the migration. It found ApiKey unprotected the first time it ran.
 *
 * Deliberately written in TypeScript rather than as a psql one-liner in the
 * workflow: the runner does not reliably have a psql binary, and under `bash
 * -e` a missing binary turns `X=$(psql ...)` into an opaque step failure. This
 * uses the Prisma client, which CI certainly has, and can be run locally too:
 *
 *   npx tsx scripts/assert-rls.ts
 */
import { PrismaClient } from "@prisma/client";

/**
 * Tables carrying an orgId that are nonetheless exempt, for one shared reason:
 * they are how a caller's org is DISCOVERED, so they cannot be gated on
 * already knowing it. Both are read with the unscoped client before
 * `app.org_id` exists; under forced RLS those lookups return nothing and
 * sign-in and API-key auth break outright.
 *
 *   Membership — requireVerifiedSession resolves the caller's org
 *   ApiKey     — resolveOrgContext resolves the key's org
 *
 * Anything else with an orgId is data, not identity, and must be forced.
 * Adding to this list means accepting that a table is protected only by
 * application code, so it needs a better reason than "the build was red".
 */
const IDENTITY_TABLES = ["Membership", "ApiKey"];

async function main() {
  // Read through the owner connection: pg_class is world-readable, but the
  // owner URL is the one guaranteed to be present in every environment.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const unprotected = await prisma.$queryRawUnsafe<{ relname: string }[]>(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = c.relname
            AND column_name = 'orgId'
        )
        AND c.relname NOT IN (${IDENTITY_TABLES.map((t) => `'${t}'`).join(", ")})
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
      ORDER BY c.relname;
    `);

    if (unprotected.length > 0) {
      const names = unprotected.map((r) => r.relname).join(", ");
      console.error(
        `\nTables with an orgId but no forced row-level security: ${names}\n\n` +
          `Each needs ENABLE + FORCE ROW LEVEL SECURITY and an org_isolation\n` +
          `policy, in a migration whose directory name ends in _rls so CI picks\n` +
          `it up. Without one, any query against that table returns every\n` +
          `tenant's rows.\n`
      );
      process.exit(1);
    }

    // Say how many passed: "no output" and "checked nothing" look identical.
    const total = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*)::bigint AS count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relrowsecurity AND c.relforcerowsecurity;
    `);
    console.log(`All tenant tables have forced RLS (${total[0].count} tables).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
