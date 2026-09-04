# Tally file formats

What the platform reads from Tally and what it writes back, derived from two
documents the client's Tally partner supplied: the **Stock Summary** export
(1-Apr-26 to 3-Sep-26, 24 groups / 531 items) and a **warehouse-to-salon tax
invoice** (Atmosot → L Studio East Fort, 31-Aug-26).

---

## 1. Stock Summary — the product master

Tally is the system of record for what a product *is*. The platform reads this
export to create and reconcile its own catalogue.

### Shape

Tally holds stock as a two-level tree — groups, with items beneath them. In the
on-screen export the level is carried by **cell indentation**, which does not
survive a save to CSV. The supported input therefore carries the group as its
own column:

| Column | Example | Notes |
|---|---|---|
| `group` | `LOREAL RETAIL` | Stock group, verbatim |
| `item` | `ABSOLUTE REPAIR MOLECULAR SHAMPOO 300 ML` | Stock item name |
| `qty` | `16` | Closing quantity; unit suffixes are stripped |
| `rate` | `1089.98` | Closing rate — **purchase cost**, ex-GST |
| `value` | `17439.60` | Closing value |

In Tally: *Stock Summary → Export*, with **Stock Group** added as a column.

### Group naming is load-bearing

Atmosot names groups `<BRAND> <CHANNEL>`. The suffix is the accounting
distinction the whole platform turns on:

| Suffix | Meaning | In the platform |
|---|---|---|
| `RETAIL` | Sold to the customer | `sellRetail` — appears on the till, sold at **MRP** |
| `SALON` / `SALOON` | Consumed during a service | `salonUse` — back bar, valued at **cost** |
| *(no suffix)* | e.g. `CONSUMABLES`, `SALON EQUIPEMENT` | Treated as salon use |

An unrecognised group defaults to **salon use**, never retail. That is a safety
default, not a guess: defaulting to retail would put an untested item on the
till where a cashier could sell a back-bar chemical to a customer.

Matching is done on a normalised form, because the live file contains
`SALOON` and `SALON`, `KANPEKI  SALON` with two spaces, and `NAASHI SALOn`.

### Where it lives in the app

- **Import** — Warehouse → Import → *Import from Tally*. Idempotent: the same
  file imported twice updates the same products rather than duplicating them.
  Quantity changes are written to the movement log, so the warehouse can still
  answer where any number came from. Ticking off "set stock to the quantities in
  the file" brings across names and rates only.
- **Export** — `GET /api/exports/tally-stock`, the same columns back out, valued
  at purchase cost. This is the reconciliation loop: after a period of trading,
  sales have drawn the shelf down here and purchases have built it up there, and
  the two files can be read side by side.

### Known gaps

- **No item code and no GUID.** The item *name* is the only key in this export,
  which is weak — renaming an item in Tally creates a second product here. The
  platform has a `tallyGuid` field for exactly this; **the connector should
  populate it**, after which name changes stop mattering.
- **No MRP.** The export carries cost only. Retail prices have to come from
  somewhere else before a `RETAIL` item can be sold.
- **50 of 531 items** carry a value with no quantity. These are kept at qty 0
  rather than dropped.

---

## 2. Warehouse → salon tax invoice

Raised by the platform, one per dispatch, and matched against Tally's own copy.

### Values on the document

| Field | Source |
|---|---|
| Seller | Org legal name, registered address, GSTIN |
| Consignee / Buyer | Receiving branch |
| Invoice no. | `<PREFIX>/<FY>/<0000>`, one unbroken series per financial year |
| Rate | **Purchase price**, exclusive of GST — the snapshot taken when the order was placed |
| HSN/SAC | Per product |
| CGST / SGST | Half the rate each; always intra-state (Kerala, code 32) |
| Round off | To the whole rupee |
| Amount in words | Indian numbering — lakh and crore |
| HSN summary | One row per HSN and rate, as GSTR-1 wants it |

### Tax rounding — read this before comparing totals

**Tally applies half the rate to each line and rounds CGST and SGST
independently.** It does not apply the full rate, round once, and split the
result. On the invoice supplied, the two methods differ:

| Method | CGST | SGST | Total tax |
|---|---|---|---|
| Full rate, then split | 441.22 | 441.24 | 882.46 |
| **Half rate per line (Tally, and this platform)** | **441.24** | **441.24** | **882.48** |

The transfer invoice reproduces the client's document to the paise —
₹4,902.55 taxable, ₹882.48 tax, (-)0.03 round off, ₹5,785.00 payable. This is
asserted in `src/lib/transfer-invoice.test.ts` against the real figures.

Note that **retail customer bills still use the full-rate-then-split method**
(`src/lib/gst.ts`). That is deliberate: a customer bill has no counterpart in
Tally to disagree with, and changing it would restate every retail invoice the
platform has already issued.

### Voucher reference

The dispatch reaches Tally as an `ALLOCATION` voucher in the outbox, which now
carries `INVOICENO` — the platform's invoice number for the same movement — so
the two systems hold the transfer under a shared reference.

---

## Open questions for the Tally partner

1. Can the connector populate `tallyGuid` (GUID/MASTERID) on stock items? It
   removes the whole class of name-matching failures.
2. Where does **MRP** live in Tally, and can it be exported alongside cost?
3. Is the warehouse a **godown**, a **cost centre**, or a **separate company**
   in their setup? That decides how `ALLOCATION` vouchers should post.
4. The sample invoice is numbered as a **Credit Note (No. 49)** while titled
   "Tax Invoice". Which voucher type should inter-branch transfers use?
