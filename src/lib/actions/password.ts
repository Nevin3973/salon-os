"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendEmail, appUrl } from "@/lib/email";
import { takeToken } from "@/lib/rate-limit";

export type PasswordResult = { ok: true; message: string } | { ok: false; error: string };

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues a single-use token and returns the raw value (only ever held in
 * memory and the email — the database stores a SHA-256 hash).
 */
export async function issueToken(
  userId: string,
  purpose: "reset" | "invite"
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      purpose,
      expiresAt: new Date(Date.now() + (purpose === "invite" ? INVITE_TTL_MS : RESET_TTL_MS)),
    },
  });
  return raw;
}

export async function sendInviteEmail(input: {
  email: string;
  name: string;
  userId: string;
  orgName: string;
}): Promise<boolean> {
  const token = await issueToken(input.userId, "invite");
  return sendEmail({
    to: input.email,
    subject: `You've been added to ${input.orgName} on Beyond Demands`,
    heading: `Welcome, ${input.name.split(" ")[0]}`,
    lines: [
      `You've been given access to ${input.orgName} on Beyond Demands.`,
      "Choose your password to activate your account. This link works once and expires in 7 days.",
    ],
    cta: { label: "Set your password", url: `${appUrl()}/reset-password?token=${token}` },
  });
}

/**
 * Starts a password reset. Always reports success so the form cannot be used
 * to discover which email addresses have accounts.
 */
export async function requestPasswordReset(input: { email: string }): Promise<PasswordResult> {
  const parsed = z.object({ email: z.string().trim().email().max(120) }).safeParse(input);
  const generic = {
    ok: true as const,
    message: "If that email has an account, we've sent a reset link. Check your inbox.",
  };
  if (!parsed.success) return generic;

  const email = parsed.data.email.toLowerCase();

  // 5 requests per 15 minutes per address — stops mailbox flooding.
  const limiter = takeToken(`pwreset:${email}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limiter.ok) return generic;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return generic; // silent no-op

  const token = await issueToken(user.id, "reset");
  await sendEmail({
    to: user.email,
    subject: "Reset your Beyond Demands password",
    heading: "Reset your password",
    lines: [
      `Hello ${user.name.split(" ")[0]},`,
      "Use the button below to choose a new password. The link works once and expires in one hour.",
      "If you didn't ask for this, you can safely ignore this email — your password stays unchanged.",
    ],
    cta: { label: "Choose a new password", url: `${appUrl()}/reset-password?token=${token}` },
  });

  return generic;
}

const resetSchema = z.object({
  token: z.string().min(10).max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(128)
    .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
      message: "Use letters and at least one number.",
    }),
});

/** Consumes a token and sets the new password. */
export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<PasswordResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, error: "This link has expired or was already used. Request a new one." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Any other outstanding tokens for this user are now void.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true, message: "Your password is set. You can sign in now." };
}
