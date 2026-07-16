import { requireSession } from "@/lib/tenant";

export default async function ImportPage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Inventory Import</h1>
      <p className="text-faint">Excel/CSV import flow lands in M3.</p>
    </>
  );
}
