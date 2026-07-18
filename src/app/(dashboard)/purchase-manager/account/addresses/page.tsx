import { requireScopedSession } from "@/lib/tenant";
import { AddressBook, type AddressData } from "./address-book";

export default async function AddressesPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");

  const addresses = await db.address.findMany({
    where: { locationId: session.locationId ?? undefined, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const data: AddressData[] = addresses.map((a) => ({
    id: a.id,
    label: a.label,
    contactName: a.contactName ?? "",
    phone: a.phone ?? "",
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state ?? "",
    postalCode: a.postalCode ?? "",
    country: a.country,
    isDefault: a.isDefault,
  }));

  return <AddressBook addresses={data} />;
}
