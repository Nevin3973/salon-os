import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.activeOrgId) redirect("/select-org");

  switch (session.activeRole) {
    case "PURCHASE_MANAGER":
      redirect("/purchase-manager/catalogue");
    case "WAREHOUSE_MANAGER":
      redirect("/warehouse/queue");
    case "SUPER_ADMIN":
      redirect("/admin/overview");
    default:
      redirect("/login");
  }
}
