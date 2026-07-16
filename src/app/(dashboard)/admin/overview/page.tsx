import { requireSession } from "@/lib/tenant";

export default async function OverviewPage() {
  await requireSession("SUPER_ADMIN");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Overview</h1>
      <p className="text-faint">Org-wide stats land in M4.</p>
    </>
  );
}
