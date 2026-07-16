import { requireSession } from "@/lib/tenant";

export default async function AdminUsersPage() {
  await requireSession("SUPER_ADMIN");
  return (
    <>
      <h1 className="font-display text-4xl mt-9 mb-2">Users & Salons</h1>
      <p className="text-faint">User and membership management lands in M4.</p>
    </>
  );
}
