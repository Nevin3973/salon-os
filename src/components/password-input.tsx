"use client";

import { useId, useState, type ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  /**
   * Extra padding the input needs on the right so the toggle never sits on top
   * of typed characters. Overridable for centred fields (the till lock), which
   * need the same padding on BOTH sides or the text stops looking centred.
   */
  padClassName?: string;
};

/**
 * A password box with a reveal toggle.
 *
 * Staff type these on a salon floor, often on a phone, frequently getting them
 * wrong — and a wrong password on the till lock costs a customer's time at the
 * counter. Being able to check what you typed is worth more here than hiding
 * it from a shoulder-surfer, which is why the toggle exists at all.
 *
 * The button is deliberately `tabIndex={-1}`: tabbing out of a password field
 * should land on the submit button, not on a decoration.
 */
export function PasswordInput({ padClassName = "pr-11", className = "", ...props }: Props) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <span className="relative block">
      <input
        {...props}
        type={shown ? "text" : "password"}
        className={`${className} ${padClassName}`.trim()}
        aria-describedby={id}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((s) => !s)}
        aria-controls={id}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        className="absolute right-0 top-0 h-full w-11 grid place-items-center text-faint hover:text-ink transition-colors rounded-r-xl outline-none focus-visible:text-ink"
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.8M6.2 6.2A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
