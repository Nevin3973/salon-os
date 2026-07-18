import { requireSession } from "@/lib/tenant";
import { PasswordForm } from "./password-form";

export default async function SecurityPage() {
  await requireSession("PURCHASE_MANAGER");
  return (
    <div className="bg-surface border border-line rounded-xl p-6">
      <h2 className="font-semibold text-lg">Change password</h2>
      <p className="text-muted text-sm mt-1">
        Use at least 10 characters with letters and at least one number.
      </p>
      <PasswordForm />
    </div>
  );
}
