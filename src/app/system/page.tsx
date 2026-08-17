import { requireScopedSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { limiterBackend } from "@/lib/rate-limit";
import { observabilityEnabled } from "@/lib/observability";
import { appVersion } from "@/lib/version";
import { fmtDateTime } from "@/lib/format";
import { PARENT_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** A backup older than this is treated as stale rather than merely recent. */
const BACKUP_STALE_HOURS = 36;

type Level = "ok" | "warn" | "bad";

export default async function SystemPage() {
  // The account owner, not a separate allowlist. A second list of who counts
  // as staff was one more thing to keep in step with reality, and the person
  // accountable for the platform is already the super admin.
  await requireScopedSession("SUPER_ADMIN");

  // Measured here, not read from a cache: an indicator that reports a stored
  // value tells you the system was healthy once, which is not the question.
  const startedAt = Date.now();
  let dbOk = true;
  let dbLatency = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - startedAt;
  } catch {
    dbOk = false;
  }

  const backups = await prisma.backupRun.findMany({
    orderBy: { finishedAt: "desc" },
    take: 10,
  });
  const lastRun = backups[0] ?? null;
  const lastGood = backups.find((b) => b.ok) ?? null;

  const version = appVersion();
  const backend = limiterBackend();
  const shared = backend === "upstash";
  const errorsConfigured = observabilityEnabled();
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const sharedSender = (process.env.EMAIL_FROM ?? "").includes("onboarding@resend.dev");

  const hoursSinceGood = lastGood
    ? (Date.now() - lastGood.finishedAt.getTime()) / 36e5
    : null;
  const backupLevel: Level =
    hoursSinceGood === null
      ? "bad"
      : hoursSinceGood > BACKUP_STALE_HOURS
        ? "bad"
        : lastRun && !lastRun.ok
          ? "warn"
          : "ok";

  return (
    <div className="theme-analytics bg-bg text-ink min-h-screen px-6 py-10">
      <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold">System status</h1>
      <p className="text-muted text-sm mt-1 max-w-xl">
        Maintenance view for {PARENT_NAME}. Everything here is checked when you load the page, not
        read from a cache. Salon staff never see this.
      </p>

      <div className="bg-surface border border-line rounded-xl p-5 mt-6">
        <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Running version</div>
        <div className="text-xl font-semibold mt-1 tabular-nums">
          v{version.version} <span className="text-muted font-normal">· {version.commit}</span>
        </div>
        <div className="text-xs text-muted mt-1">
          {version.builtAt ? `Built ${version.builtAt}` : "Built locally — not from a release image"}
        </div>
      </div>

      <h2 className="text-base font-semibold mt-8">Live checks</h2>
      <div className="mt-3 divide-y divide-line-soft border border-line rounded-xl bg-surface">
        <Indicator
          label="Database"
          level={dbOk ? "ok" : "bad"}
          value={dbOk ? `Reachable · ${dbLatency} ms` : "Unreachable"}
          note={
            dbOk
              ? "Round trip from this server. Over ~100 ms usually means app and database are in different regions."
              : "Nothing will work until this recovers."
          }
        />
        <Indicator
          label="Rate limiting"
          level={shared ? "ok" : "warn"}
          value={shared ? `Shared (${backend})` : "In-memory only"}
          note={
            shared
              ? "Sign-in limits hold across every instance."
              : "Limits apply per instance, so brute-force protection weakens as the app scales out."
          }
        />
        <Indicator
          label="Error reporting"
          level={errorsConfigured ? "ok" : "warn"}
          value={errorsConfigured ? "Configured" : "Not configured"}
          note="Configured means reports have somewhere to go — not that anything has been sent."
        />
        <Indicator
          label="Email"
          level={!emailConfigured ? "warn" : sharedSender ? "warn" : "ok"}
          value={
            !emailConfigured ? "Not configured" : sharedSender ? "Shared sender" : "Own domain"
          }
          note={
            sharedSender
              ? "The shared sender only delivers to the account owner's own address. Verify a domain to reach salons."
              : "Password resets and order notifications can reach real inboxes."
          }
        />
        <Indicator
          label="Off-site backup"
          level={backupLevel}
          value={
            lastGood
              ? `Last good ${fmtDateTime(lastGood.finishedAt)}`
              : "No successful backup recorded"
          }
          note={
            lastGood
              ? `${Math.round(hoursSinceGood!)} h ago. The managed database also keeps its own daily snapshot, so this is the second of two independent copies.`
              : "Either the job has never succeeded or it is not reporting. Both need looking at."
          }
        />
      </div>

      <h2 className="text-base font-semibold mt-8">Backup history</h2>
      <p className="text-muted text-xs mt-0.5">
        Reported by the nightly job on success and on failure. A gap in these rows means the job did
        not run at all, which is as serious as a failure.
      </p>

      <div className="bg-surface border border-line rounded-xl overflow-x-auto mt-3">
        {backups.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">
            Nothing reported yet. The job reports here once{" "}
            <code className="text-xs">BACKUP_REPORT_TOKEN</code> is set in both the app and the
            workflow secrets.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                <th className="font-medium px-4 py-3">Finished</th>
                <th className="font-medium px-4 py-3">Result</th>
                <th className="font-medium px-4 py-3 text-right">Size</th>
                <th className="font-medium px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(b.finishedAt)}</td>
                  <td className="px-4 py-3">
                    <span className={b.ok ? "text-in" : "text-out"}>
                      {b.ok ? "Succeeded" : "Failed"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {b.sizeBytes != null ? formatBytes(b.sizeBytes) : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {b.message ?? <span className="text-faint">—</span>}
                    {b.commit && <span className="text-faint"> · {b.commit}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </div>
  );
}

function Indicator({
  label,
  level,
  value,
  note,
}: {
  label: string;
  level: Level;
  value: string;
  note: string;
}) {
  const dot =
    level === "ok" ? "bg-in" : level === "warn" ? "bg-velvet" : "bg-out";
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm text-muted">{value}</span>
          <span className="sr-only">
            {level === "ok" ? "Working" : level === "warn" ? "Needs attention" : "Not working"}
          </span>
        </div>
        <div className="text-xs text-faint mt-0.5 leading-relaxed">{note}</div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
