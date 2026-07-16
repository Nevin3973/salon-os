import { requireSession } from "@/lib/tenant";

export default async function QueuePage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Order Queue</h1>
      <p className="text-faint">Pending/processing queue and staged dispatch land in M2.</p>
    </>
  );
}
