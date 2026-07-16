import { requireSession } from "@/lib/tenant";

export default async function OutstandingPage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Outstanding Items</h1>
      <p className="text-faint">Backorder fulfilment lands in M3.</p>
    </>
  );
}
