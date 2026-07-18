import { requireSession } from "@/lib/tenant";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold">Inventory import</h1>
        <p className="text-muted text-sm mt-1">
          Upload a CSV to update stock levels, create products, or synchronize after a stock audit.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
