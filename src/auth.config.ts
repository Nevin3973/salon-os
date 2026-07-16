import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config: no Credentials provider, no Prisma import here.
 * Used directly by middleware; extended with the real provider in `src/auth.ts`
 * for use in Server Actions / Route Handlers (Node runtime).
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial sign-in: `user` is whatever `authorize()` returned.
      if (user) {
        token.uid = user.id!;
        token.mustChangePassword = Boolean((user as { mustChangePassword?: boolean }).mustChangePassword);
        token.memberships = user.memberships ?? [];
        token.activeOrgId = null;
        token.activeRole = null;
        token.activeLocationId = null;
        if (token.memberships.length === 1) {
          const only = token.memberships[0];
          token.activeOrgId = only.orgId;
          token.activeRole = only.role;
          token.activeLocationId = only.locationId;
        }
      }

      // Org-picker: client calls `update({ orgId })` after choosing an org.
      if (trigger === "update" && session?.orgId) {
        const chosen = token.memberships.find((m) => m.orgId === session.orgId);
        if (chosen) {
          token.activeOrgId = chosen.orgId;
          token.activeRole = chosen.role;
          token.activeLocationId = chosen.locationId;
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid;
      session.user.mustChangePassword = token.mustChangePassword;
      session.memberships = token.memberships;
      session.activeOrgId = token.activeOrgId;
      session.activeRole = token.activeRole;
      session.activeLocationId = token.activeLocationId;
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      const isPublic = pathname === "/login" || pathname.startsWith("/api/auth");
      if (isPublic) return true;
      if (!isLoggedIn) return false;

      if (pathname.startsWith("/select-org")) return true;
      if (!auth?.activeOrgId) return false; // must pick an org first

      if (pathname.startsWith("/purchase-manager") && auth.activeRole !== "PURCHASE_MANAGER") return false;
      if (pathname.startsWith("/warehouse") && auth.activeRole !== "WAREHOUSE_MANAGER") return false;
      if (pathname.startsWith("/admin") && auth.activeRole !== "SUPER_ADMIN") return false;

      return true;
    },
  },
};
