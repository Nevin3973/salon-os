import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <div className="theme-ops min-h-screen bg-bg text-ink flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="font-display text-3xl select-none">
            Beyond<span className="text-velvet"> Demands</span>
          </div>
          <h1 className="text-lg font-semibold mt-8">Forgot your password?</h1>
          <p className="text-muted text-sm mt-1.5">
            Enter your email and we&rsquo;ll send you a link to choose a new one.
          </p>
          <ForgotForm />
          <Link
            href="/login"
            className="block text-center text-sm text-muted hover:text-ink mt-6"
          >
            Back to sign in
          </Link>
        </div>
      </div>
      <p className="text-center text-faint text-xs pb-6">Beyond Demands · by Infynix Growth Solutions</p>
    </div>
  );
}
