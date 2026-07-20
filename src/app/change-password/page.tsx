import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ForcedPasswordForm } from "./forced-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="theme-ops min-h-screen bg-bg text-ink flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="font-display text-3xl select-none">
            Beyond<span className="text-velvet"> Demands</span>
          </div>
          <h1 className="text-lg font-semibold mt-8">Set your own password</h1>
          <p className="text-muted text-sm mt-1.5">
            You signed in with a one-time password. Choose a new one to continue —
            at least 10 characters, with letters and a number.
          </p>
          <ForcedPasswordForm />
        </div>
      </div>
      <p className="text-center text-faint text-xs pb-6">Beyond Demands · by Infynix Growth Solutions</p>
    </div>
  );
}
