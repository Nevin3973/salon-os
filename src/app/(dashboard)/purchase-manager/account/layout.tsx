import { AccountNav } from "./account-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-6">Your account</h1>
      <div className="grid md:grid-cols-[220px_1fr] gap-8 items-start">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
