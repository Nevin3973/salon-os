"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-muted hover:text-ink text-sm px-3 py-1.5 rounded-lg hover:bg-velvet-soft/60 transition-all duration-200 cursor-pointer btn-press"
    >
      Sign out
    </button>
  );
}
