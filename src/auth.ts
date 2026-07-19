import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { takeToken, resetTokens } from "@/lib/rate-limit";
import type { MembershipSummary } from "@/lib/types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.toLowerCase().trim();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // 5 tries per 10 minutes per account, then wait it out.
        // (Failed attempts count; a success clears the counter.)
        const limiter = takeToken(`login:${email}`, { limit: 5, windowMs: 10 * 60 * 1000 });
        if (!limiter.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: {
              include: { org: true, location: true },
            },
          },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        resetTokens(`login:${email}`);

        const memberships: MembershipSummary[] = user.memberships.map((m) => ({
          orgId: m.orgId,
          orgName: m.org.name,
          role: m.role,
          locationId: m.locationId,
          locationName: m.location?.name ?? null,
        }));

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          mustChangePassword: user.mustChangePassword,
          memberships,
        };
      },
    }),
  ],
});
