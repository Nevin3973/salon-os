"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { verifyOwnPassword } from "@/lib/actions/account";
import { WORDMARK } from "@/lib/brand";

/**
 * Idle lock for the counter.
 *
 * A till often sits unattended on a shared device between customers, so after a
 * few quiet minutes this covers the screen and asks the signed-in person to
 * re-enter their password. The lock state is kept in sessionStorage, so a
 * refresh (or an accidental navigation) doesn't clear it.
 *
 * This is a supervision control, not a security boundary: it stops a passer-by
 * using someone else's till, but anyone with developer tools could hide the
 * overlay. The real protections sit on the server — a 12-hour session and a
 * live membership re-check on every action that moves money.
 *
 * Nothing in the page unmounts while locked, so a half-built bill survives.
 */
const LOCK_KEY = "salonos:till-locked";

/** The console wrapper this lock makes inert. Set in the salon layout. */
export const LOCKABLE_ID = "till-lockable";

export function TillLock({
  userName,
  idleMinutes = 5,
}: {
  userName: string;
  idleMinutes?: number;
}) {
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    setLocked(true);
    try { sessionStorage.setItem(LOCK_KEY, "1"); } catch { /* private mode */ }
  }, []);

  // Restore a lock that was in place before a refresh.
  useEffect(() => {
    try { if (sessionStorage.getItem(LOCK_KEY) === "1") setLocked(true); } catch { /* ignore */ }
  }, []);

  /**
   * Take the console out of the tab order while locked.
   *
   * Covering the screen is not the same as blocking it: without this the page
   * behind stays focusable, and anyone could Tab straight past the lock into
   * the POS and keep selling. `inert` removes the whole subtree from focus,
   * clicks and the accessibility tree in one attribute.
   */
  useEffect(() => {
    const shell = document.getElementById(LOCKABLE_ID);
    if (!shell) return;
    if (locked) shell.setAttribute("inert", "");
    else shell.removeAttribute("inert");
    return () => shell.removeAttribute("inert");
  }, [locked]);

  // Any real interaction resets the countdown.
  useEffect(() => {
    if (locked) return;
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(lock, idleMinutes * 60 * 1000);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [locked, idleMinutes, lock]);

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await verifyOwnPassword({ password });
      if (res.ok) {
        setLocked(false);
        setPassword("");
        try { sessionStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
      } else {
        setError(res.error);
        setPassword("");
      }
    });
  }

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Till locked"
      className="fixed inset-0 z-[100] bg-bg/95 backdrop-blur-sm grid place-items-center px-6"
    >
      <div className="w-full max-w-xs text-center">
        <div className="font-display text-2xl select-none">
          {WORDMARK.first}<span className="text-velvet"> {WORDMARK.second}</span>
        </div>
        <p className="text-muted text-sm mt-6">Locked while you were away.</p>
        <p className="text-ink font-semibold">{userName}</p>

        <form onSubmit={unlock} className="mt-5">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            aria-label="Your password"
            autoFocus
            className="w-full h-12 bg-surface border border-line rounded-xl px-4 text-center text-base outline-none focus:border-velvet"
          />
          {error && <p className="text-out text-xs mt-2">{error}</p>}
          <button
            type="submit"
            disabled={pending || !password}
            className="mt-3 w-full h-12 rounded-xl bg-velvet text-on-velvet font-semibold disabled:opacity-40 cursor-pointer"
          >
            {pending ? "Checking…" : "Unlock"}
          </button>
        </form>

        <button
          onClick={() => {
            try { sessionStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
            signOut({ callbackUrl: "/login" });
          }}
          className="mt-4 text-xs text-muted hover:text-ink cursor-pointer"
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
