import { requireSession } from "@/lib/tenant";

export default async function PmDashboardPage() {
  const session = await requireSession("PURCHASE_MANAGER");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Good morning, {session.name.split(" ")[0]}.</h1>
      <p className="text-faint">Stats and quick-reorder land in M1.</p>
    </>
  );
}
