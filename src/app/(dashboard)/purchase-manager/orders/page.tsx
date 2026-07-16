import { requireSession } from "@/lib/tenant";

export default async function OrdersPage() {
  await requireSession("PURCHASE_MANAGER");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Order History</h1>
      <p className="text-faint">Order history, search, reorder and cancel land in M1.</p>
    </>
  );
}
