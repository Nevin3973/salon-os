import Link from "next/link";
import { requireSession } from "@/lib/tenant";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requireSession("WAREHOUSE_MANAGER");
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Inventory import</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed max-w-2xl">
          Upload a CSV to update stock levels, create products, or synchronize after a stock audit.
        </p>
      </div>
      <div className="bg-surface border border-line rounded-xl p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-ink">Importing from Tally?</p>
          <p className="text-xs text-muted mt-0.5">
            Use the Stock Summary import instead — it reads Tally&rsquo;s own group and item
            columns.
          </p>
        </div>
        <Link
          href="/warehouse/import/tally"
          className="h-9 px-4 rounded-[6px] border border-line text-sm font-medium hover:border-velvet hover:text-velvet transition-colors grid place-items-center shrink-0"
        >
          Import from Tally
        </Link>
      </div>

      <ImportWizard />
    </div>
  );
}
