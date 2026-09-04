import Link from "next/link";
import { requireSession } from "@/lib/tenant";
import { TallyImportForm } from "./tally-import-form";

export default async function TallyImportPage() {
  await requireSession("WAREHOUSE_MANAGER");

  return (
    <div>
      <div className="mb-6">
        <Link href="/warehouse/import" className="text-sm text-muted hover:text-ink">
          &larr; Inventory import
        </Link>
        <h1 className="text-2xl font-semibold text-ink mt-2">Import from Tally</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed max-w-2xl">
          Brings Tally&rsquo;s Stock Summary across as the product master — item names, their stock
          group, and what each one cost. Run it again any time to reconcile: the same file imported
          twice updates the same products rather than duplicating them.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-xl p-5 max-w-2xl">
        <h2 className="text-sm font-semibold">Getting the file out of Tally</h2>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          <strong className="text-ink">Stock Summary → Export</strong>, as CSV, with{" "}
          <strong className="text-ink">Stock Group</strong> added as its own column.
        </p>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          The group column matters. On screen Tally shows groups and items as an indented tree, and
          that indentation is lost the moment the sheet is saved as CSV — without a group column
          there is no way to tell a group heading from an item under it.
        </p>
        <div className="mt-3 bg-bg border border-line-soft rounded-[6px] p-3 overflow-x-auto">
          <code className="text-xs text-muted whitespace-pre">
            {"group,item,qty,rate,value\nLOREAL RETAIL,ABSOLUTE REPAIR MOLECULAR SHAMPOO 300 ML,16,1089.98,17439.60"}
          </code>
        </div>
        <p className="text-sm text-muted mt-3 leading-relaxed">
          Groups ending <strong className="text-ink">RETAIL</strong> become products the till can
          sell. Everything else — including <code className="text-xs">CONSUMABLES</code> and{" "}
          <code className="text-xs">SALON EQUIPEMENT</code> — is treated as salon use, so nothing
          untested can be rung up by mistake.
        </p>
      </div>

      <TallyImportForm />
    </div>
  );
}
