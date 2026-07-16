"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-faint hover:text-ink text-sm">
      Sign out
    </button>
  );
}
