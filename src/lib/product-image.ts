/**
 * Picks a display image for a product. Real product photos are used for the
 * items they actually depict; everything else gets a clean category
 * illustration so the storefront never shows an empty tile.
 */

const EXACT: Record<string, string> = {
  "Repair Shampoo 1L": "/products/shampoo.png",
  "Moisture Conditioner 1L": "/products/shampoo.png",
  "Retail Shampoo 250ml": "/products/shampoo.png",
  "Smoothing Serum 100ml": "/products/serum.png",
  "Vitamin C Serum 30ml": "/products/serum.png",
  "Argan Oil 50ml — Retail": "/products/serum.png",
  "Nitrile Gloves M (100)": "/products/gloves.png",
  "Disposable Gloves S (100)": "/products/gloves.png",
};

const BY_CATEGORY: Record<string, string> = {
  "Hair Care": "/products/cat/bottle.svg",
  "Hair Colour": "/products/cat/tube.svg",
  "Hair Treatments": "/products/cat/jar.svg",
  "Skin Care": "/products/cat/bottle.svg",
  Facial: "/products/cat/jar.svg",
  Waxing: "/products/cat/jar.svg",
  "Nail Care": "/products/cat/polish.svg",
  "Retail Products": "/products/cat/bottle.svg",
  Tools: "/products/cat/tool.svg",
  Electrical: "/products/cat/device.svg",
  Furniture: "/products/cat/box.svg",
  "Cleaning Supplies": "/products/cat/bottle.svg",
  Consumables: "/products/cat/box.svg",
};

export function productImageUrl(name: string, category: string): string {
  return EXACT[name] ?? BY_CATEGORY[category] ?? "/products/cat/box.svg";
}
