import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="theme-ops min-h-screen bg-bg text-ink flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="font-display text-3xl select-none">
            Beyond<span className="text-velvet"> Demands</span>
          </div>

          {token ? (
            <>
              <h1 className="text-lg font-semibold mt-8">Choose your password</h1>
              <p className="text-muted text-sm mt-1.5">
                At least 10 characters, with letters and a number.
              </p>
              <ResetForm token={token} />
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold mt-8">This link isn&rsquo;t valid</h1>
              <p className="text-muted text-sm mt-1.5">
                The link is missing its code. Request a new one and try again.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block mt-6 h-11 px-6 leading-[44px] rounded-[10px] bg-velvet text-on-velvet text-sm font-semibold"
              >
                Request a new link
              </Link>
            </>
          )}

          <Link href="/login" className="block text-center text-sm text-muted hover:text-ink mt-6">
            Back to sign in
          </Link>
        </div>
      </div>
      <p className="text-center text-faint text-xs pb-6">Beyond Demands · by Infynix Growth Solutions</p>
    </div>
  );
}
