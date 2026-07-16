import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
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
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: {
            memberships: {
              include: { org: true, location: true },
            },
          },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

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
