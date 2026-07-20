import { requireScopedSession } from "@/lib/tenant";
import { fmtDateTime } from "@/lib/format";
import { AuditSearch } from "./audit-search";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { db } = await requireScopedSession("SUPER_ADMIN");
  const { q } = await searchParams;

  const query = (q ?? "").trim();
  const entries = await db.auditLogEntry.findMany({
    where: query
      ? {
          OR: [
            { action: { contains: query, mode: "insensitive" } },
            { userName: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-muted text-sm mt-1 max-w-xl">
        Everything that happens in this workspace, newest first.
      </p>

      <div className="mt-5 max-w-sm">
        <AuditSearch initial={q ?? ""} />
      </div>

      <div className="bg-surface border border-line rounded-[10px] overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-3 whitespace-nowrap">When</th>
              <th className="font-medium px-4 py-3">Who</th>
              <th className="font-medium px-4 py-3">What</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line-soft">
                <td className="px-4 py-2.5 text-faint text-xs whitespace-nowrap tabular-nums">
                  {fmtDateTime(e.createdAt)}
                </td>
                <td className="px-4 py-2.5 text-velvet whitespace-nowrap">{e.userName ?? "System"}</td>
                <td className="px-4 py-2.5 text-muted">{e.action}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-faint">
                  {query ? `Nothing matches “${query}”.` : "Nothing here yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
