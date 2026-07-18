import { requireSession } from "@/lib/tenant";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink">Inventory import</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed max-w-2xl">
          Upload a CSV to update stock levels, create products, or synchronize after a stock audit.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
