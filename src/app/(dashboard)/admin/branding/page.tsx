import { requireScopedSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { LogoPanel } from "./logo-panel";

/**
 * Where a salon sets its own identity inside the product.
 *
 * Read through `prisma` rather than the scoped client because Org is the
 * tenant itself, not a row inside one — it carries no `orgId` column and so is
 * not in SCOPED_MODELS. The id comes from the verified session, which is the
 * scope.
 */
export default async function AdminBrandingPage() {
  const { session } = await requireScopedSession("SUPER_ADMIN");
  const org = await prisma.org.findUnique({
    where: { id: session.orgId },
    select: { name: true, logoUrl: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Branding</h1>
      <p className="text-muted text-sm mt-1 max-w-xl">
        Your salon&rsquo;s logo appears beside its name in every console. {PRODUCT_NAME} stays{" "}
        {PRODUCT_TAGLINE}, shown separately above it.
      </p>

      <LogoPanel orgName={org?.name ?? ""} logoUrl={org?.logoUrl ?? null} />
    </div>
  );
}
