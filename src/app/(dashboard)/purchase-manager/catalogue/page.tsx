import { requireSession } from "@/lib/tenant";

export default async function CataloguePage() {
  const session = await requireSession("PURCHASE_MANAGER");
  return (
    <>
      <p className="eyebrow text-[11px] tracking-[0.22em] uppercase text-faint mt-9">{session.locationId ? "Branch" : ""}</p>
      <h1 className="font-display text-4xl mt-1 mb-2">Product Catalogue</h1>
      <p className="text-faint">Signed in as {session.name}. Catalogue, cart and checkout land in M1.</p>
    </>
  );
}
