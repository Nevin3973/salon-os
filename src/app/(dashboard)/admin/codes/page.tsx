import { requireSession } from "@/lib/tenant";

export default async function AdminCodesPage() {
  await requireSession("SUPER_ADMIN");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Authorization Codes</h1>
      <p className="text-faint">Generate/rotate codes lands in M4.</p>
    </>
  );
}
