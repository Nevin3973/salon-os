import { requireSession } from "@/lib/tenant";

export default async function LogPage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Inventory Log</h1>
      <p className="text-faint">Stock movement history lands in M3.</p>
    </>
  );
}
