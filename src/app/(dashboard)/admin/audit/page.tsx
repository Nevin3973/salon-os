import { requireSession } from "@/lib/tenant";

export default async function AdminAuditPage() {
  await requireSession("SUPER_ADMIN");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Audit Log</h1>
      <p className="text-faint">Searchable audit trail lands in M4.</p>
    </>
  );
}
