import { requireSession } from "@/lib/tenant";

export default async function AdminProductsPage() {
  await requireSession("SUPER_ADMIN");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Products</h1>
      <p className="text-faint">Activate/deactivate management lands in M4.</p>
    </>
  );
}
