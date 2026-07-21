import { Resend } from "resend";

/**
 * Transactional email. Degrades gracefully: with no API key configured the
 * app still works and the message is logged instead of sent, so local dev and
 * preview environments never fail because of email.
 *
 * Sending is always best-effort — callers must not let a mail failure roll
 * back a database transaction that already succeeded.
 */

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "Beyond Demands <onboarding@resend.dev>";

export function appUrl(): string {
  return (
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
}

export function emailConfigured(): boolean {
  return Boolean(KEY);
}

const resend = KEY ? new Resend(KEY) : null;

type SendInput = { to: string | string[]; subject: string; heading: string; lines: string[]; cta?: { label: string; url: string } };

/** Never throws — returns false when the message could not be sent. */
export async function sendEmail({ to, subject, heading, lines, cta }: SendInput): Promise<boolean> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return false;

  if (!resend) {
    console.info(`[email skipped — no RESEND_API_KEY] "${subject}" → ${recipients.join(", ")}`);
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: recipients,
      subject,
      html: renderHtml(heading, lines, cta),
      text: [heading, "", ...lines, cta ? `\n${cta.label}: ${cta.url}` : ""].join("\n"),
    });
    if (error) {
      console.error("[email] send failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send threw:", e instanceof Error ? e.message : e);
    return false;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtml(heading: string, lines: string[], cta?: { label: string; url: string }): string {
  const body = lines.map((l) => `<p style="margin:0 0 12px;color:#444;font-size:15px;line-height:1.55">${esc(l)}</p>`).join("");
  const button = cta
    ? `<a href="${cta.url}" style="display:inline-block;margin-top:8px;background:#111;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${esc(cta.label)}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:28px">
    <div style="font-size:19px;font-weight:700;color:#111;margin-bottom:4px">Beyond<span style="color:#b8860b"> Demands</span></div>
    <h1 style="font-size:17px;color:#111;margin:18px 0 14px">${esc(heading)}</h1>
    ${body}
    ${button}
    <p style="margin:22px 0 0;border-top:1px solid #eee;padding-top:14px;color:#999;font-size:12px">
      Beyond Demands · salon supply. If this wasn't you, you can ignore this email.
    </p>
  </div></body></html>`;
}
