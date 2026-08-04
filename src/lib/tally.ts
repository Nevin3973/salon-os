import { getScopedDb } from "@/lib/tenant";
import type { ReportScope, ReportRange } from "@/lib/reports";

/**
 * Tally Prime / ERP 9 voucher export.
 *
 * Tally imports XML in its own envelope format, so this builds sales vouchers
 * (and credit notes for returns) that an accountant can import straight into
 * the client's company file — no re-keying at month end.
 *
 * Two things the accountant must line up on their side, because Tally matches
 * on NAME, not on any id we control:
 *   - the ledgers below must already exist in their chart of accounts;
 *   - the company name must match the target company exactly.
 * Both are configurable per export so the file can be tailored to the client
 * rather than forcing them to rename their ledgers to suit us.
 */

export type TallyLedgers = {
  /** Where the money landed — usually "Cash" or a bank/UPI ledger. */
  cash: string;
  card: string;
  upi: string;
  /** Revenue ledger the taxable value is credited to. */
  sales: string;
  cgst: string;
  sgst: string;
  roundOff: string;
};

export const DEFAULT_LEDGERS: TallyLedgers = {
  cash: "Cash",
  card: "Card Receipts",
  upi: "UPI Receipts",
  sales: "Sales Accounts",
  cgst: "CGST",
  sgst: "SGST",
  roundOff: "Round Off",
};

/** XML text escaping — product names legitimately contain & and quotes. */
function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Tally wants plain rupees with two decimals, never a currency symbol. */
function amt(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

/** Tally dates are YYYYMMDD with no separators. */
function tallyDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function ledgerEntry(name: string, amountMinor: number, isDebit: boolean): string {
  // Tally's sign convention: a debit carries ISDEEMEDPOSITIVE=Yes and a
  // NEGATIVE amount; a credit is the mirror. Getting this backwards is the
  // usual reason an imported voucher won't balance.
  const signed = isDebit ? -Math.abs(amountMinor) : Math.abs(amountMinor);
  return `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${amt(signed)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`;
}

type SaleForTally = {
  invoiceCode: string;
  createdAt: Date;
  customerName: string | null;
  buyerGstin: string | null;
  paymentMode: string;
  subtotalCents: number;
  taxCents: number;
  roundOffCents: number;
  totalCents: number;
  items: {
    name: string;
    hsn: string | null;
    qty: number;
    unitPriceCents: number;
    lineNetCents: number;
    taxCents: number;
  }[];
};

function partyLedger(paymentMode: string, l: TallyLedgers): string {
  if (paymentMode === "CARD") return l.card;
  if (paymentMode === "UPI") return l.upi;
  return l.cash;
}

/**
 * One voucher. `kind` picks between a sale and a credit note; the accounting is
 * the same shape with the debits and credits swapped, which is exactly what a
 * return is.
 */
function voucher(
  sale: SaleForTally,
  kind: "Sales" | "Credit Note",
  l: TallyLedgers,
  unit: string
): string {
  const isSale = kind === "Sales";
  const party = partyLedger(sale.paymentMode, l);
  const halfTax = Math.floor(sale.taxCents / 2);
  const otherHalf = sale.taxCents - halfTax;

  const entries = [
    // Money in (or back out, on a credit note).
    ledgerEntry(party, sale.totalCents, isSale),
    ledgerEntry(l.sales, sale.subtotalCents, !isSale),
    ...(halfTax > 0 ? [ledgerEntry(l.cgst, halfTax, !isSale)] : []),
    ...(otherHalf > 0 ? [ledgerEntry(l.sgst, otherHalf, !isSale)] : []),
    ...(sale.roundOffCents !== 0
      ? [ledgerEntry(l.roundOff, Math.abs(sale.roundOffCents), isSale ? sale.roundOffCents < 0 : sale.roundOffCents > 0)]
      : []),
  ].join("\n");

  const inventory = sale.items
    .map(
      (it) => `        <ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${esc(it.name)}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>${isSale ? "No" : "Yes"}</ISDEEMEDPOSITIVE>
          <RATE>${amt(it.unitPriceCents)}/${esc(unit)}</RATE>
          <AMOUNT>${amt(isSale ? it.lineNetCents : -it.lineNetCents)}</AMOUNT>
          <ACTUALQTY>${it.qty} ${esc(unit)}</ACTUALQTY>
          <BILLEDQTY>${it.qty} ${esc(unit)}</BILLEDQTY>${
            it.hsn ? `\n          <HSNCODE>${esc(it.hsn)}</HSNCODE>` : ""
          }
          <ACCOUNTINGALLOCATIONS.LIST>
            <LEDGERNAME>${esc(l.sales)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isSale ? "No" : "Yes"}</ISDEEMEDPOSITIVE>
            <AMOUNT>${amt(isSale ? it.lineNetCents : -it.lineNetCents)}</AMOUNT>
          </ACCOUNTINGALLOCATIONS.LIST>
        </ALLINVENTORYENTRIES.LIST>`
    )
    .join("\n");

  return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${esc(kind)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
          <DATE>${tallyDate(sale.createdAt)}</DATE>
          <EFFECTIVEDATE>${tallyDate(sale.createdAt)}</EFFECTIVEDATE>
          <VOUCHERTYPENAME>${esc(kind)}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${esc(sale.invoiceCode)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME>
          <PARTYNAME>${esc(sale.customerName || "Walk-in customer")}</PARTYNAME>${
            sale.buyerGstin ? `\n          <PARTYGSTIN>${esc(sale.buyerGstin)}</PARTYGSTIN>` : ""
          }
          <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
${entries}
${inventory}
        </VOUCHER>
      </TALLYMESSAGE>`;
}

/** Wraps vouchers in the envelope Tally expects from an import file. */
export function tallyEnvelope(companyName: string, vouchers: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchers.join("\n")}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
}

/**
 * Builds the whole import file for a date range: every settled sale as a Sales
 * voucher, plus a Credit Note for each return. Voided bills are skipped — they
 * never were business, and importing them would leave the accountant reversing
 * entries by hand.
 */
export async function tallyXml(
  scope: ReportScope,
  range: ReportRange,
  opts: { companyName: string; ledgers?: Partial<TallyLedgers> }
): Promise<string> {
  const l = { ...DEFAULT_LEDGERS, ...(opts.ledgers ?? {}) };
  const db = getScopedDb(scope.orgId);

  const createdAt =
    range.from || range.to
      ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
      : undefined;

  const sales = await db.sale.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(createdAt ? { createdAt } : {}),
      status: { not: "VOID" },
    },
    include: { items: true, returns: { include: { items: true } } },
    orderBy: { createdAt: "asc" },
  });

  const out: string[] = [];
  for (const s of sales) {
    out.push(
      voucher(
        {
          invoiceCode: s.invoiceCode,
          createdAt: s.createdAt,
          customerName: s.customerName,
          buyerGstin: s.buyerGstin,
          paymentMode: s.paymentMode,
          subtotalCents: s.subtotalCents,
          taxCents: s.taxCents,
          roundOffCents: s.roundOffCents,
          totalCents: s.totalCents,
          items: s.items.map((it) => ({
            name: it.name,
            hsn: it.hsn,
            qty: it.qty,
            unitPriceCents: it.unitPriceCents,
            lineNetCents: it.lineNetCents,
            taxCents: it.taxCents,
          })),
        },
        "Sales",
        l,
        "nos"
      )
    );

    // Each return becomes its own credit note against the same party.
    for (const r of s.returns) {
      const nameById = new Map(s.items.map((it) => [it.id, it]));
      out.push(
        voucher(
          {
            invoiceCode: r.creditNoteCode,
            createdAt: r.createdAt,
            customerName: s.customerName,
            buyerGstin: s.buyerGstin,
            paymentMode: r.refundMode,
            subtotalCents: r.subtotalCents,
            taxCents: r.taxCents,
            roundOffCents: 0,
            totalCents: r.totalCents,
            items: r.items.map((ri) => {
              const orig = nameById.get(ri.saleItemId);
              return {
                name: orig?.name ?? "Returned item",
                hsn: orig?.hsn ?? null,
                qty: ri.qty,
                unitPriceCents: orig?.unitPriceCents ?? 0,
                lineNetCents: ri.lineNetCents,
                taxCents: ri.taxCents,
              };
            }),
          },
          "Credit Note",
          l,
          "nos"
        )
      );
    }
  }

  return tallyEnvelope(opts.companyName, out);
}

/**
 * HSN-wise summary — the table GSTR-1 asks for. Grouped by HSN and rate across
 * settled sales, net of anything returned in the period.
 */
export async function hsnSummary(scope: ReportScope, range: ReportRange) {
  const db = getScopedDb(scope.orgId);
  const createdAt =
    range.from || range.to
      ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
      : undefined;

  const sales = await db.sale.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(createdAt ? { createdAt } : {}),
      status: { not: "VOID" },
    },
    include: { items: true },
  });

  const rows = new Map<
    string,
    { hsn: string; rate: number; qty: number; taxableCents: number; cgstCents: number; sgstCents: number }
  >();

  for (const s of sales) {
    for (const it of s.items) {
      // Count only what the customer kept.
      const keptQty = it.qty - it.returnedQty;
      if (keptQty <= 0) continue;
      const taxable = Math.round((it.lineNetCents * keptQty) / it.qty);
      const tax = Math.round((taxable * it.gstRate) / 100);
      const cgst = Math.floor(tax / 2);

      const hsn = it.hsn || "—";
      const key = `${hsn}:${it.gstRate}`;
      const row = rows.get(key) ?? {
        hsn, rate: it.gstRate, qty: 0, taxableCents: 0, cgstCents: 0, sgstCents: 0,
      };
      row.qty += keptQty;
      row.taxableCents += taxable;
      row.cgstCents += cgst;
      row.sgstCents += tax - cgst;
      rows.set(key, row);
    }
  }

  return [...rows.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
}
