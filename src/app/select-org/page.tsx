import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { VelvetLogo } from "@/components/velvet-logo";
import { SelectOrgList } from "./select-org-list";

export default async function SelectOrgPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.activeOrgId) redirect("/");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <VelvetLogo subtitle="Salon Supply" />
      <h1 className="font-display text-2xl font-semibold mt-8">Choose your workspace</h1>
      <p className="text-muted mt-2 max-w-md">
        You have access to more than one organization. Pick which one to work in.
      </p>
      <SelectOrgList memberships={session.memberships} />
    </div>
  );
}
