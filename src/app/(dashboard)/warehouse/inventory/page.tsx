import { requireSession } from "@/lib/tenant";

export default async function InventoryPage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Inventory</h1>
      <p className="text-faint">Reserved/available table and manual adjustments land in M3.</p>
    </>
  );
}
