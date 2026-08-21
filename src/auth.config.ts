import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";
import type { MembershipSummary } from "@/lib/types";

type AppClaims = {
  uid: string;
  mustChangePassword: boolean;
  memberships: MembershipSummary[];
  activeOrgId: string | null;
  activeRole: Role | null;
  activeLocationId: string | null;
};

/**
 * Edge-safe NextAuth config: no Credentials provider, no Prisma import here.
 * Used directly by middleware; extended with the real provider in `src/auth.ts`
 * for use in Server Actions / Route Handlers (Node runtime).
 */
/// Endpoints that authenticate themselves with an API key instead of a session.
/// Every entry must resolve the key and return 401 when it is missing or wrong.
const MACHINE_ROUTES = new Set([
  "/api/v1/products",
  "/api/v1/orders",
  "/api/tally/vouchers",
  "/api/tally/ack",
  "/api/tally/inbound/items",
  "/api/tally/inbound/purchases",
]);

/// One dynamic segment, matched narrowly rather than by prefix.
const ORDER_BY_ID = /^\/api\/v1\/orders\/[^/]+$/;

function isMachineRoute(pathname: string): boolean {
  return MACHINE_ROUTES.has(pathname) || ORDER_BY_ID.test(pathname);
}

export const authConfig: NextAuthConfig = {
  // Required on Vercel/behind proxies: trust the platform-provided host header.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    /**
     * A working day, not NextAuth's 30-day default. These accounts move money
     * and often live on a shared counter device, so a token left behind on a
     * borrowed machine expires the same day rather than next month.
     *
     * `updateAge` re-issues the token hourly while someone is actually working,
     * so an active shift is never interrupted. The token only carries routing
     * claims: anything that moves money re-checks the live membership on the
     * server (`requireVerifiedSession`), so a revoked account stops working
     * immediately regardless of what its token still says.
     */
    maxAge: 12 * 60 * 60,
    updateAge: 60 * 60,
  },
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const t = token as typeof token & AppClaims;

      // Initial sign-in: `user` is whatever `authorize()` returned.
      if (user) {
        t.uid = user.id!;
        t.mustChangePassword = Boolean((user as { mustChangePassword?: boolean }).mustChangePassword);
        t.memberships = (user as { memberships?: MembershipSummary[] }).memberships ?? [];
        t.activeOrgId = null;
        t.activeRole = null;
        t.activeLocationId = null;
        if (t.memberships.length === 1) {
          const only = t.memberships[0];
          t.activeOrgId = only.orgId;
          t.activeRole = only.role;
          t.activeLocationId = only.locationId;
        }
      }

      // Org-picker: client calls `update({ orgId })` after choosing an org.
      if (trigger === "update" && session?.orgId) {
        const chosen = t.memberships.find((m) => m.orgId === session.orgId);
        if (chosen) {
          t.activeOrgId = chosen.orgId;
          t.activeRole = chosen.role;
          t.activeLocationId = chosen.locationId;
        }
      }

      return t;
    },
    async session({ session, token }) {
      const t = token as typeof token & AppClaims;
      session.user.id = t.uid;
      session.user.mustChangePassword = t.mustChangePassword;
      session.memberships = t.memberships;
      session.activeOrgId = t.activeOrgId;
      session.activeRole = t.activeRole;
      session.activeLocationId = t.activeLocationId;
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      const isPublic =
        pathname === "/login" ||
        pathname === "/forgot-password" ||
        pathname === "/reset-password" ||
        // Uptime monitors must reach this without credentials. It reports
        // posture (backend names, booleans) and never any tenant data.
        pathname === "/api/health" ||
        // The nightly backup job reports here. It is a CI runner with no login,
        // so a session check would make the endpoint unreachable and the
        // backup history permanently empty. It carries its own bearer-token
        // check and refuses everything when that token is unset, so opening it
        // here does not open it to the world.
        pathname === "/api/backups" ||
        // The Tally connector runs on the client's LAN with an API key and no
        // browser session, so a session check here would make the integration
        // unreachable — it redirects to /login, which a machine caller reads as
        // a 307 rather than a refusal. Every route under it verifies the key
        // itself and returns 401 when it is missing or wrong.
        // Machine-authenticated endpoints. Callers carry an API key and no
        // browser session, so the session check here would redirect them to
        // /login — which a connector reads as a 307, not as an auth failure.
        //
        // Listed one by one, NOT by prefix. A prefix match would make every
        // future route under /api/v1 or /api/tally public the moment someone
        // adds it, which is exactly backwards for an auth boundary: forgetting
        // to add a route here fails closed and is noticed immediately, while
        // forgetting to add auth to a route under a public prefix fails open
        // and is noticed by whoever finds the data.
        isMachineRoute(pathname) ||
        pathname.startsWith("/api/auth");
      if (isPublic) return true;
      if (!isLoggedIn) return false;

      if (pathname.startsWith("/select-org") || pathname.startsWith("/change-password")) return true;
      if (!auth?.activeOrgId) return false; // must pick an org first

      if (pathname.startsWith("/purchase-manager") && auth.activeRole !== "PURCHASE_MANAGER") return false;
      if (pathname.startsWith("/salon")) {
        // The counter (sell + own bills) is open to salon staff and managers;
        // inventory and reports are manager-only.
        const managerOnly = pathname.startsWith("/salon/inventory") || pathname.startsWith("/salon/reports");
        if (managerOnly) {
          if (auth.activeRole !== "PURCHASE_MANAGER") return false;
        } else if (auth.activeRole !== "PURCHASE_MANAGER" && auth.activeRole !== "SALON_STAFF") {
          return false;
        }
      }
      if (pathname.startsWith("/warehouse") && auth.activeRole !== "WAREHOUSE_MANAGER") return false;
      if (pathname.startsWith("/admin") && auth.activeRole !== "SUPER_ADMIN") return false;

      return true;
    },
  },
};
