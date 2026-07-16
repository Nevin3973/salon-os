import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SelectOrgList } from "./select-org-list";

export default async function SelectOrgPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.activeOrgId) redirect("/");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="font-display text-4xl tracking-[0.2em]">
        AMARA
        <small className="block text-xs tracking-[0.34em] text-gold mt-2 font-sans">
          CENTRAL SUPPLY
        </small>
      </div>
      <p className="text-faint mt-6 max-w-md">
        You have access to more than one organization. Choose which one to work in.
      </p>
      <SelectOrgList memberships={session.memberships} />
    </div>
  );
}
