import React, { useState, useMemo } from "react";

/* ————————————————————————————————————————————————————————
   AMARA · Central Supply — v6
   Adds to v5:
   · Reserved stock: open orders reserve quantities; branches
     see true AVAILABLE stock (physical − reserved).
   · Staged dispatch: warehouse can "Dispatch now" repeatedly;
     every delivery is recorded with a timestamp. "Close order"
     settles the rest as outstanding (reason + expected date).
   · Dispatch quantity is hard-clamped and visibly compared
     against BOTH the remaining request and physical stock.
   · Inline confirmations for destructive actions (no alerts).
   · Role switcher in the header — demo the lifecycle fast.
   · Inventory Log tab: every stock movement, prev → new.
   · Order search (PM), audit-log filter (Admin).
   · Editable minimum stock in the inventory table.
   · Date picker for expected availability.
——————————————————————————————————————————————————————— */

const T = {
  bg: "#0A0A0A", card: "#141414", ink: "#F2EFE6", faint: "#98938B",
  line: "#282828", gold: "#D4AF37", goldHover: "#E5C558",
  sage: "#93A98B", copper: "#C87A3E", red: "#B85C5C",
};

const SECTIONS = {
  "Hair Care": "#181715", "Hair Colour": "#181616", "Hair Treatments": "#171614",
  "Skin Care": "#161613", "Facial": "#171515", "Waxing": "#181613",
  "Nail Care": "#171414", "Retail Products": "#161615", "Tools": "#161616",
  "Electrical": "#151515", "Furniture": "#171613", "Cleaning Supplies": "#151613",
  "Consumables": "#161614",
};
const CATEGORIES = ["All", ...Object.keys(SECTIONS)];

let _id = 0;
const P = (name, brand, cat, unit, stock, min) => ({
  id: ++_id,
  sku: `${cat.split(" ").map((w) => w[0]).join("")}-${1000 + _id}`,
  name, brand, cat, unit, stock, min, image: null, active: true,
});

const SEED_PRODUCTS = [
  P("Repair Shampoo 1L", "Kérastase", "Hair Care", "bottle", 64, 20),
  P("Moisture Conditioner 1L", "Kérastase", "Hair Care", "bottle", 12, 20),
  P("Smoothing Serum 100ml", "Moroccanoil", "Hair Care", "bottle", 38, 12),
  P("Dry Shampoo 300ml", "Batiste Pro", "Hair Care", "can", 26, 10),
  P("Colour Tube — 6.35 Chestnut", "Majirel", "Hair Colour", "tube", 148, 40),
  P("Colour Tube — 9.1 Ash Blonde", "Majirel", "Hair Colour", "tube", 0, 40),
  P("Developer 20 Vol 4L", "Oxydant", "Hair Colour", "can", 22, 10),
  P("Bleach Powder 500g", "Blond Studio", "Hair Colour", "tub", 17, 8),
  P("Bond Builder No.1 500ml", "Olaplex Pro", "Hair Treatments", "bottle", 9, 6),
  P("Keratin Smoothing Kit", "Brasil Cacau", "Hair Treatments", "kit", 6, 4),
  P("Deep Repair Mask 500g", "Kérastase", "Hair Treatments", "jar", 21, 8),
  P("Scalp Detox Treatment", "Nioxin", "Hair Treatments", "bottle", 14, 6),
  P("Gentle Cleanser 500ml", "Dermalogica", "Skin Care", "bottle", 31, 12),
  P("Hydrating Toner 250ml", "Dermalogica", "Skin Care", "bottle", 19, 10),
  P("Vitamin C Serum 30ml", "SkinCeuticals", "Skin Care", "bottle", 11, 12),
  P("Daily Moisturiser SPF30", "Dermalogica", "Skin Care", "tube", 28, 10),
  P("Clay Cleansing Mask 500g", "Dermalogica", "Facial", "jar", 8, 10),
  P("Enzyme Exfoliant 300g", "Dermalogica", "Facial", "jar", 15, 6),
  P("Collagen Eye Pads (30 pr)", "Skin Republic", "Facial", "box", 24, 10),
  P("Hydra-Facial Serum Set", "HydroPeel", "Facial", "kit", 5, 4),
  P("Hot Wax Beads 1kg — Rose", "Rica", "Waxing", "bag", 33, 15),
  P("Strip Wax 800ml — Honey", "Rica", "Waxing", "tin", 20, 10),
  P("Non-Woven Wax Strips (100)", "Procare", "Waxing", "pack", 47, 20),
  P("Post-Wax Soothing Lotion", "Rica", "Waxing", "bottle", 18, 8),
  P("Gel Lacquer — Porcelain Rose", "OPI", "Nail Care", "bottle", 27, 8),
  P("Base + Top Coat Duo", "OPI", "Nail Care", "set", 16, 8),
  P("Acetone Remover 1L", "ProNails", "Nail Care", "bottle", 12, 10),
  P("Cuticle Oil 15ml", "OPI", "Nail Care", "bottle", 44, 15),
  P("Retail Shampoo 250ml", "Kérastase", "Retail Products", "bottle", 52, 20),
  P("Argan Oil 50ml — Retail", "Moroccanoil", "Retail Products", "bottle", 30, 12),
  P("Travel Care Kit", "Kérastase", "Retail Products", "kit", 14, 8),
  P('Cutting Scissors 5.5"', "Jaguar", "Tools", "piece", 7, 4),
  P("Sectioning Clips (12)", "YS Park", "Tools", "pack", 56, 20),
  P("Tint Brush Set (3)", "Framar", "Tools", "set", 23, 10),
  P("Carbon Cutting Comb", "YS Park", "Tools", "piece", 40, 15),
  P("Professional Blow Dryer", "Parlux", "Electrical", "unit", 4, 3),
  P("Ceramic Straightener", "GHD Pro", "Electrical", "unit", 3, 3),
  P("Cordless Clippers", "Wahl", "Electrical", "unit", 6, 3),
  P("UV/LED Nail Lamp 48W", "SunUV", "Electrical", "unit", 5, 3),
  P("Hydraulic Styling Chair", "Beauty Line", "Furniture", "unit", 2, 1),
  P("Trolley Cart — 5 Tray", "Beauty Line", "Furniture", "unit", 3, 2),
  P("Shampoo Backwash Unit", "Beauty Line", "Furniture", "unit", 1, 1),
  P("Disinfectant Concentrate 2L", "Barbicide", "Cleaning Supplies", "bottle", 15, 8),
  P("Surface Sanitiser Spray", "Clinell", "Cleaning Supplies", "bottle", 29, 12),
  P("Towel Laundry Detergent 5L", "Persil Pro", "Cleaning Supplies", "can", 9, 6),
  P("Floor Cleaner 5L", "Diversey", "Cleaning Supplies", "can", 11, 6),
  P("Colour Foil Roll 100m", "Procare", "Consumables", "roll", 5, 12),
  P("Nitrile Gloves M (100)", "Unigloves", "Consumables", "box", 90, 30),
  P("Disposable Towels (50)", "Scrummi", "Consumables", "pack", 34, 20),
  P("Neck Strips (5×100)", "Procare", "Consumables", "box", 22, 10),
  P("Cotton Pads 1kg", "Intrinsics", "Consumables", "bag", 18, 10),
  P("Client Capes — Disposable (30)", "Procare", "Consumables", "pack", 13, 10),
];

const byName = (n) => SEED_PRODUCTS.find((p) => p.name === n);
const item = (n, req, extra = {}) => ({
  pid: byName(n).id, name: n, req, del: 0, note: "", deliveries: [], ...extra,
});

const SEED_ORDERS = [
  {
    id: "ORD-0229", branch: "Marina Walk", placedBy: "Sara N.", date: "15 Jul", status: "Pending",
    items: [
      item("Moisture Conditioner 1L", 18),
      item("Colour Foil Roll 100m", 8, { note: "urgent — balayage bookings all week" }),
      item("Nitrile Gloves M (100)", 6),
    ],
  },
  {
    id: "ORD-0230", branch: "Palm District", placedBy: "Huda K.", date: "15 Jul", status: "Pending",
    items: [item("Hot Wax Beads 1kg — Rose", 10), item("Colour Tube — 9.1 Ash Blonde", 20)],
  },
  {
    id: "ORD-0231", branch: "Rosewood Avenue", placedBy: "Leila M.", date: "12 Jul", status: "Partially Fulfilled",
    items: [
      item("Repair Shampoo 1L", 20, { del: 20, deliveries: [{ qty: 20, time: "12 Jul 10:04" }] }),
      item("Moisture Conditioner 1L", 15, { del: 10, deliveries: [{ qty: 10, time: "12 Jul 10:04" }], reason: "Awaiting supplier", eta: "2026-07-18" }),
    ],
  },
  {
    id: "ORD-0224", branch: "Rosewood Avenue", placedBy: "Leila M.", date: "05 Jul", status: "Completed",
    items: [
      item("Colour Tube — 6.35 Chestnut", 30, { del: 30, deliveries: [{ qty: 30, time: "05 Jul 09:31" }] }),
      item("Developer 20 Vol 4L", 4, { del: 4, deliveries: [{ qty: 4, time: "05 Jul 09:31" }] }),
    ],
  },
];

const USERS = [
  { name: "Leila M.", role: "Purchase Manager", place: "Rosewood Avenue" },
  { name: "Sara N.", role: "Purchase Manager", place: "Marina Walk" },
  { name: "Huda K.", role: "Purchase Manager", place: "Palm District" },
  { name: "Omar D.", role: "Warehouse Manager", place: "Central Warehouse" },
  { name: "A. Rahman", role: "Super Admin", place: "Head Office" },
];
const SWITCHABLE = [USERS[0], USERS[3], USERS[4]];

const REASONS = ["Out of stock", "Awaiting supplier", "Damaged stock", "Quality hold", "Other"];

const IMPORT_FILE = {
  name: "warehouse_stock_16jul.xlsx",
  rows: [
    { sku: "HC-1001", name: "Repair Shampoo 1L", qty: 120 },
    { sku: "HC-1002", name: "Moisture Conditioner 1L", qty: 80 },
    { sku: "HC-1006", name: "Colour Tube — 9.1 Ash Blonde", qty: 60 },
    { sku: "C-1047", name: "Colour Foil Roll 100m", qty: 40 },
    { sku: "HT-1010", name: "Keratin Smoothing Kit", qty: -5 },
    { sku: "NEW-2001", name: "Argan Repair Ampoules (10)", qty: 25 },
    { sku: "T-1033", name: "", qty: 30 },
  ],
};

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/* ——— atoms ——— */

const Dot = ({ color }) => (
  <span style={{ width: 6, height: 6, borderRadius: 99, background: color, display: "inline-block", flexShrink: 0 }} />
);
const Leader = () => (
  <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${T.line}`, margin: "0 10px", transform: "translateY(-4px)" }} />
);
const STATUS_COLOR = {
  Pending: T.faint, Processing: T.gold, "Partially Fulfilled": T.copper,
  Completed: T.sage, Cancelled: T.red,
};
const Chip = ({ status }) => (
  <span className="chip" style={{ color: STATUS_COLOR[status] }}><Dot color={STATUS_COLOR[status]} /> {status}</span>
);
const Eyebrow = ({ children, style }) => <p className="eyebrow" style={style}>{children}</p>;

/* two-click confirmation — no alerts, no modals */
function Confirm({ label, confirm, onConfirm, kind = "link", danger }) {
  const [armed, setArmed] = useState(false);
  const cls = kind === "primary" ? "primary" : danger ? "remove upcase" : "linkGold";
  return (
    <button
      className={cls}
      style={armed ? { color: kind === "primary" ? "#0A0A0A" : T.red, borderColor: kind === "primary" ? T.red : undefined, background: kind === "primary" ? T.red : undefined } : undefined}
      onClick={() => (armed ? (onConfirm(), setArmed(false)) : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirm : label}
    </button>
  );
}

function ProductImage({ product, small }) {
  if (product.image) return <img src={product.image} alt={product.name} className="pimg" />;
  return (
    <div className={`pimg placeholder ${small ? "small" : ""}`} style={{ background: SECTIONS[product.cat] || T.card }}>
      <span className="ph-initial">{product.brand[0]}</span>
      {!small && <span className="ph-hint">photo pending</span>}
    </div>
  );
}

function Stepper({ value, onChange, max }) {
  const btn = {
    width: 26, height: 26, border: `1px solid ${T.line}`, borderRadius: 99,
    background: "transparent", color: T.ink, cursor: "pointer",
    fontFamily: "'Jost', sans-serif", fontSize: 14, lineHeight: 1,
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button style={btn} onClick={() => onChange(Math.max(1, value - 1))} aria-label="Decrease quantity">−</button>
      <span style={{ minWidth: 18, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <button style={btn} onClick={() => onChange(max ? Math.min(max, value + 1) : value + 1)} aria-label="Increase quantity">+</button>
    </span>
  );
}

/* ═══════════════════════════ APP ═══════════════════════════ */

export default function AmaraSupply() {
  const [session, setSession] = useState(null);

  /* shared, living state */
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [orderSeq, setOrderSeq] = useState(232);
  const [codes, setCodes] = useState(["ROSE-4821", "MARW-1937", "PALM-2260"]);
  const [movements, setMovements] = useState([
    { time: "12 Jul 10:04", user: "Omar D.", product: "Repair Shampoo 1L", prev: 84, next: 64, action: "Dispatch · ORD-0231" },
  ]);
  const [audit, setAudit] = useState([
    { time: "09:12", user: "Omar D.", action: "Closed ORD-0231 — 5 × Moisture Conditioner 1L outstanding (Awaiting supplier, 18 Jul)" },
    { time: "08:40", user: "Sara N.", action: "Submitted ORD-0229 (3 items) from Marina Walk" },
  ]);
  const log = (action, user) =>
    setAudit((a) => [{ time: now(), user: user || session?.name || "System", action }, ...a]);
  const move = (product, prev, next, action, user) =>
    setMovements((m) => [{ time: now(), user: user || session?.name || "System", product, prev, next, action }, ...m]);

  /* PM state */
  const [tab, setTab] = useState("Catalogue");
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [view, setView] = useState("grid");
  const [qty, setQty] = useState({});
  const [cart, setCart] = useState([]);
  const [noteOpen, setNoteOpen] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState("cart");
  const [authCode, setAuthCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [openOrder, setOpenOrder] = useState(null);
  const [placedId, setPlacedId] = useState(null);

  /* WM state */
  const [wTab, setWTab] = useState("Queue");
  const [openJob, setOpenJob] = useState(null);
  const [draft, setDraft] = useState({});
  const [invFilter, setInvFilter] = useState("All");
  const [imp, setImp] = useState({ step: 0, mode: "Inventory Update", summary: null });

  /* Admin state */
  const [aTab, setATab] = useState("Overview");
  const [auditQuery, setAuditQuery] = useState("");

  /* ——— derived: reserved & available ——— */
  const reservedFor = (pid) =>
    orders.reduce((sum, o) => {
      if (o.status !== "Pending" && o.status !== "Processing") return sum;
      const it = o.items.find((x) => x.pid === pid);
      return it ? sum + (it.req - it.del) : sum;
    }, 0);
  const availableFor = (p) => Math.max(0, p.stock - reservedFor(p.id));
  const availState = (p) => {
    const a = availableFor(p);
    return a === 0 ? "out" : a < p.min ? "low" : "in";
  };
  const STOCK_META = {
    in: { label: "Available", color: T.sage },
    low: { label: "Low", color: T.copper },
    out: { label: "None available", color: T.faint },
  };

  const activeProducts = products.filter((p) => p.active);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeProducts.filter(
      (p) =>
        (cat === "All" || p.cat === cat) &&
        (!q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    );
  }, [activeProducts, cat, query]);
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((p) => { (g[p.cat] = g[p.cat] || []).push(p); });
    return g;
  }, [filtered]);

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const prod = (pid) => products.find((p) => p.id === pid);
  const myOrders = orders
    .filter((o) => o.branch === session?.place)
    .filter((o) => {
      const q = orderQuery.trim().toLowerCase();
      return !q || o.id.toLowerCase().includes(q) || o.items.some((it) => it.name.toLowerCase().includes(q));
    });
  const queue = orders.filter((o) => o.status === "Pending" || o.status === "Processing");
  const outstanding = orders.flatMap((o) =>
    o.status !== "Partially Fulfilled" ? [] :
    o.items.filter((it) => it.del < it.req).map((it) => ({ ...it, orderId: o.id, branch: o.branch }))
  );
  const lowList = products.filter((p) => p.active && availState(p) !== "in");
  const myShortages = orders.filter((o) => o.branch === session?.place && o.status === "Partially Fulfilled");
  const shortageCount = myShortages.reduce((s, o) => s + o.items.filter((it) => it.del < it.req).length, 0);

  /* ——— PM actions ——— */
  const addToCart = (p, n) => {
    const add = n || qty[p.id] || 1;
    setCart((c) => {
      const i = c.findIndex((l) => l.pid === p.id);
      if (i > -1) { const nx = [...c]; nx[i] = { ...nx[i], qty: nx[i].qty + add }; return nx; }
      return [...c, { pid: p.id, qty: add, note: "" }];
    });
    setQty((m) => ({ ...m, [p.id]: 1 }));
  };
  const updateLine = (pid, patch) => setCart((c) => c.map((l) => (l.pid === pid ? { ...l, ...patch } : l)));
  const removeLine = (pid) => setCart((c) => c.filter((l) => l.pid !== pid));

  const submitAuth = () => {
    if (authCode.trim().length < 6) { setAuthError("Enter your 6-character authorization code."); return; }
    const id = `ORD-0${orderSeq}`;
    const order = {
      id, branch: session.place, placedBy: session.name, date: "16 Jul", status: "Pending",
      items: cart.map((l) => ({ pid: l.pid, name: prod(l.pid).name, req: l.qty, del: 0, note: l.note, deliveries: [] })),
    };
    setOrders((o) => [order, ...o]);
    setOrderSeq((s) => s + 1);
    setPlacedId(id);
    log(`Submitted ${id} (${cart.length} item${cart.length === 1 ? "" : "s"}) from ${session.place} — stock reserved`);
    setAuthError("");
    setCheckout("done");
  };
  const closeCart = () => {
    setCartOpen(false);
    if (checkout === "done") { setCart([]); setAuthCode(""); setCheckout("cart"); }
  };
  const reorder = (o) => {
    setCart(o.items.map((it) => ({ pid: it.pid, qty: it.req, note: "" })));
    setCartOpen(true); setCheckout("cart");
    log(`Started reorder of ${o.id}`);
  };
  const cancelOrder = (o) => {
    setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: "Cancelled" } : x)));
    log(`Cancelled ${o.id} — reservation released`);
  };

  /* ——— WM actions ——— */
  /* every dispatch line is clamped to min(remaining request, physical stock) */
  const lineMax = (it) => {
    const p = prod(it.pid);
    return Math.min(it.req - it.del, p ? p.stock : 0);
  };
  const draftFor = (o) => {
    if (draft[o.id]) return draft[o.id];
    const d = {};
    o.items.forEach((it, i) => { d[i] = { dispatch: lineMax(it), reason: it.reason || "", eta: it.eta || "", remark: "", err: false }; });
    return d;
  };
  const setD = (oid, idx, patch) =>
    setDraft((dd) => ({ ...dd, [oid]: { ...dd[oid], [idx]: { ...dd[oid]?.[idx], ...patch } } }));

  const startProcessing = (o) => {
    setDraft((dd) => ({ ...dd, [o.id]: draftFor(o) }));
    setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: "Processing" } : x)));
    setOpenJob(o.id);
    log(`Started processing ${o.id}`);
  };

  const applyDispatch = (o, closing) => {
    const d = draft[o.id] || draftFor(o);

    if (closing) {
      /* remaining-after-this-dispatch lines need a reason */
      let bad = false;
      o.items.forEach((it, i) => {
        const remainingAfter = it.req - it.del - (d[i]?.dispatch || 0);
        if (remainingAfter > 0 && !d[i]?.reason) { setD(o.id, i, { err: true }); bad = true; }
      });
      if (bad) return;
    }

    const time = `16 Jul ${now()}`;
    const stockDelta = {};
    const items = o.items.map((it, i) => {
      const q = Math.min(d[i]?.dispatch || 0, lineMax(it));
      if (q > 0) {
        stockDelta[it.pid] = (stockDelta[it.pid] || 0) + q;
        const p = prod(it.pid);
        move(it.name, p.stock, p.stock - q, `Dispatch · ${o.id} → ${o.branch}`);
      }
      const del = it.del + q;
      const remaining = it.req - del;
      return {
        ...it, del,
        deliveries: q > 0 ? [...it.deliveries, { qty: q, time }] : it.deliveries,
        reason: closing && remaining > 0 ? d[i].reason : it.reason,
        eta: closing && remaining > 0 ? d[i].eta : it.eta,
        remark: d[i]?.remark || it.remark,
      };
    });

    setProducts((ps) => ps.map((p) => (stockDelta[p.id] ? { ...p, stock: Math.max(0, p.stock - stockDelta[p.id]) } : p)));

    const full = items.every((it) => it.del === it.req);
    const dispatchedNow = Object.values(stockDelta).reduce((a, b) => a + b, 0);

    if (closing || full) {
      const status = full ? "Completed" : "Partially Fulfilled";
      setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, items, status } : x)));
      const shorts = items.filter((it) => it.del < it.req);
      log(full
        ? `Completed ${o.id} — all items dispatched in full`
        : `Closed ${o.id} — ${shorts.map((s) => `${s.req - s.del} × ${s.name} outstanding (${s.reason}${s.eta ? `, ${fmtDate(s.eta)}` : ""})`).join("; ")}`);
      setOpenJob(null);
      setDraft((dd) => { const nx = { ...dd }; delete nx[o.id]; return nx; });
    } else {
      setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, items } : x)));
      log(`Dispatched ${dispatchedNow} unit${dispatchedNow === 1 ? "" : "s"} against ${o.id} — order stays open`);
      /* reset drafts to new maxima */
      const nd = {};
      items.forEach((it, i) => {
        const p = prod(it.pid);
        const newStock = p ? Math.max(0, p.stock - (stockDelta[it.pid] || 0)) : 0;
        nd[i] = { ...d[i], dispatch: Math.min(it.req - it.del, newStock), err: false };
      });
      setDraft((dd) => ({ ...dd, [o.id]: nd }));
    }
  };

  const fulfilOutstanding = (row) => {
    const p = prod(row.pid);
    const need = row.req - row.del;
    if (!p || p.stock < need) return;
    const time = `16 Jul ${now()}`;
    move(row.name, p.stock, p.stock - need, `Outstanding fulfilled · ${row.orderId} → ${row.branch}`);
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, stock: x.stock - need } : x)));
    setOrders((os) =>
      os.map((o) => {
        if (o.id !== row.orderId) return o;
        const items = o.items.map((it) =>
          it.pid === row.pid ? { ...it, del: it.req, deliveries: [...it.deliveries, { qty: need, time }] } : it
        );
        const full = items.every((it) => it.del === it.req);
        return { ...o, items, status: full ? "Completed" : o.status };
      })
    );
    log(`Fulfilled outstanding ${need} × ${row.name} for ${row.orderId} (${row.branch})`);
  };

  const adjustStock = (p, delta) => {
    const next = Math.max(0, p.stock + delta);
    move(p.name, p.stock, next, "Manual adjustment");
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, stock: next } : x)));
    log(`Manual adjustment: ${p.name} ${delta > 0 ? "+" : ""}${delta} (now ${next})`);
  };
  const setMin = (p, min) =>
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, min: Math.max(0, min) } : x)));

  const importCheck = useMemo(() => {
    const valid = [], errors = [], warnings = [];
    IMPORT_FILE.rows.forEach((r, i) => {
      const row = i + 2;
      const match = products.find((p) => p.sku === r.sku);
      if (!r.name) { errors.push(`Row ${row}: missing product name (SKU ${r.sku})`); return; }
      if (r.qty < 0) { errors.push(`Row ${row}: invalid quantity ${r.qty} for "${r.name}"`); return; }
      if (!match && imp.mode === "Inventory Update") { errors.push(`Row ${row}: SKU ${r.sku} not found — switch to Product Import to create it`); return; }
      if (!match) warnings.push(`Row ${row}: "${r.name}" will be created as a new product`);
      valid.push({ ...r, isNew: !match, current: match ? match.stock : "—" });
    });
    return { valid, errors, warnings };
  }, [products, imp.mode]);

  const confirmImport = () => {
    let updated = 0, created = 0;
    setProducts((ps) => {
      let next = [...ps];
      importCheck.valid.forEach((r) => {
        const i = next.findIndex((p) => p.sku === r.sku);
        if (i > -1) { move(r.name, next[i].stock, r.qty, `Import · ${IMPORT_FILE.name}`); next[i] = { ...next[i], stock: r.qty }; updated++; }
        else {
          created++;
          move(r.name, 0, r.qty, `Import (new) · ${IMPORT_FILE.name}`);
          next = [...next, { id: ++_id, sku: r.sku, name: r.name, brand: "—", cat: "Hair Treatments", unit: "unit", stock: r.qty, min: 5, image: null, active: true }];
        }
      });
      return next;
    });
    setImp((s) => ({ ...s, step: 3, summary: { updated, created, failed: importCheck.errors.length, warnings: importCheck.warnings.length, time: "0.8s" } }));
    log(`Imported ${IMPORT_FILE.name} — ${updated} updated, ${created} created, ${importCheck.errors.length} failed (${imp.mode})`);
  };

  /* ——— admin actions ——— */
  const toggleActive = (p) => {
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
    log(`${p.active ? "Deactivated" : "Activated"} product ${p.name}`);
  };
  const generateCode = () => {
    const c = `AMR-${Math.floor(1000 + Math.random() * 9000)}`;
    setCodes((cs) => [c, ...cs]);
    log(`Generated purchase authorization code ${c}`);
  };

  const signIn = (u, switched) => {
    setSession(u);
    setTab("Catalogue"); setWTab("Queue"); setATab("Overview");
    setCartOpen(false); setOpenJob(null); setOpenOrder(null);
    log(switched ? `Switched role to ${u.role}` : "Signed in", u.name);
  };
  const signOut = () => { log("Signed out"); setSession(null); setCart([]); setCartOpen(false); };

  /* ═════════ styles ═════════ */
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Marcellus&family=Jost:ital,wght@0,300;0,400;0,500;1,400&display=swap');
    .app { min-height: 100vh; background: ${T.bg}; color: ${T.ink};
      font-family: 'Jost', sans-serif; font-weight: 300; font-size: 15px; letter-spacing: 0.01em; }
    .display { font-family: 'Marcellus', serif; font-weight: 400; }
    .eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: ${T.faint}; margin: 0; }
    .hairline-b { border-bottom: 1px solid ${T.line}; }
    .shell { max-width: 1120px; margin: 0 auto; padding: 0 28px 80px; }

    header.top { display: flex; align-items: baseline; justify-content: space-between; padding: 28px 0 20px; gap: 16px; flex-wrap: wrap; }
    .wordmark { font-size: 22px; letter-spacing: 0.14em; white-space: nowrap; }
    .wordmark small { color: ${T.gold}; letter-spacing: 0.22em; font-size: 11px; margin-left: 14px; }
    nav.tabs { display: flex; gap: 26px; flex-wrap: wrap; }
    .tab { background: none; border: none; cursor: pointer; padding: 6px 0; font: inherit;
      color: ${T.faint}; letter-spacing: 0.06em; border-bottom: 1px solid transparent; }
    .tab.on { color: ${T.ink}; border-bottom-color: ${T.gold}; }
    .tab .badge { color: ${T.gold}; margin-left: 5px; font-size: 12px; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid ${T.gold}; outline-offset: 3px; }

    .roleSel { background: transparent; border: none; border-bottom: 1px solid ${T.line}; color: ${T.faint};
      font: inherit; font-size: 13px; padding: 4px 0; cursor: pointer; appearance: none; }
    .roleSel option { background: ${T.card}; color: ${T.ink}; }

    .cartBtn { background: none; border: 1px solid ${T.gold}; border-radius: 99px; padding: 7px 18px;
      font: inherit; cursor: pointer; color: ${T.gold}; letter-spacing: 0.08em; transition: background .2s, color .2s; }
    .cartBtn:hover { background: ${T.gold}; color: #0A0A0A; }

    h1.page { font-size: 40px; margin: 26px 0 6px; }
    .hero { font-size: 46px; line-height: 1.15; margin: 34px 0 8px; max-width: 24ch; }
    .hero em { font-style: normal; color: ${T.gold}; }
    .sub { color: ${T.faint}; max-width: 58ch; }

    .cats { display: flex; gap: 26px; overflow-x: auto; padding: 18px 0 14px; scrollbar-width: none; }
    .cats::-webkit-scrollbar { display: none; }
    .catLink { background: none; border: none; padding: 2px 0; cursor: pointer; font: inherit;
      color: ${T.faint}; letter-spacing: 0.04em; white-space: nowrap; }
    .catLink.on { color: ${T.gold}; }
    .search { background: transparent; border: none; border-bottom: 1px solid ${T.line};
      padding: 6px 2px; font: inherit; color: ${T.ink}; width: min(320px, 100%); margin-top: 6px; }
    .search::placeholder, input::placeholder { color: ${T.faint}; }

    .toolRow { display:flex; align-items:baseline; gap:24px; flex-wrap:wrap; }
    .viewToggle { margin-left:auto; display:flex; gap:14px; }
    .viewToggle button { background:none; border:none; font:inherit; font-size:12px; letter-spacing:.14em;
      text-transform:uppercase; color:${T.faint}; cursor:pointer; padding:4px 0; }
    .viewToggle button.on { color:${T.gold}; }

    .sectionHead { display: flex; align-items: baseline; gap: 14px; margin: 40px 0 14px; }
    .sectionHead .n { color: ${T.faint}; font-size: 12px; letter-spacing: .1em; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 1px; background: ${T.line}; border: 1px solid ${T.line}; }
    .card { background: ${T.card}; padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 4px; transition: background .2s; }
    .card:hover { background: #1A1A1A; }
    .pimg { width: 100%; height: 110px; border-radius: 2px; object-fit: cover; margin-bottom: 12px; }
    .placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      border: 1px dashed rgba(242,239,230,.14); }
    .placeholder.small { width: 42px; height: 42px; margin: 0; flex-shrink: 0; }
    .ph-initial { font-family: 'Marcellus', serif; font-size: 26px; color: rgba(212,175,55,.6); }
    .placeholder.small .ph-initial { font-size: 17px; }
    .ph-hint { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(242,239,230,.32); }

    .sku { font-size: 11px; letter-spacing: 0.14em; color: ${T.faint}; }
    .pname { font-size: 16px; line-height: 1.3; }
    .brand { color: ${T.faint}; font-size: 13px; }
    .cardFoot { margin-top: 12px; padding-top: 10px; border-top: 1px solid ${T.line};
      display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .stockRow { display: flex; align-items: center; gap: 7px; font-size: 12px; color: ${T.faint}; }
    .add { background: none; border: none; cursor: pointer; font: inherit; color: ${T.gold};
      letter-spacing: 0.1em; font-size: 12px; text-transform: uppercase; padding: 4px 0; }
    .add:disabled { color: ${T.line}; cursor: default; }

    .listRow { display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid ${T.line}; }
    .listRow .pname { font-size:15px; }

    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.6); opacity: 0; pointer-events: none; transition: opacity .25s; }
    .scrim.on { opacity: 1; pointer-events: auto; }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100%); background: ${T.card};
      border-left: 1px solid ${T.line}; transform: translateX(102%); transition: transform .3s ease;
      display: flex; flex-direction: column; padding: 30px 30px 26px; overflow-y: auto; }
    .drawer.on { transform: none; }
    @media (prefers-reduced-motion: reduce) { .drawer, .scrim { transition: none; } }

    .menuLine { display: flex; align-items: baseline; padding: 13px 0; }
    .menuLine + .menuLine { border-top: 1px solid ${T.bg}; }
    .qtyMark { font-variant-numeric: tabular-nums; color: ${T.faint}; font-size: 13px; }
    .remove, .noteBtn { background: none; border: none; color: ${T.faint}; cursor: pointer; font-size: 12px; letter-spacing: .08em; padding: 0; }
    .remove:hover, .noteBtn:hover { color: ${T.gold}; }
    .upcase { letter-spacing: .1em; text-transform: uppercase; }
    .noteField { width: 100%; background: transparent; border: none; border-bottom: 1px dotted ${T.line};
      font: inherit; font-size: 13px; color: ${T.ink}; padding: 4px 0; margin: 2px 0 8px; }
    .noteText { font-size: 12px; color: ${T.faint}; font-style: italic; }

    .primary { background: ${T.gold}; color: #0A0A0A; border: 1px solid ${T.gold}; border-radius: 99px;
      padding: 12px 26px; font: inherit; letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px;
      cursor: pointer; margin-top: 22px; transition: background .15s, border-color .15s; }
    .primary:hover { background: ${T.goldHover}; border-color: ${T.goldHover}; }
    .primary:disabled { background:${T.line}; border-color:${T.line}; color:${T.faint}; cursor:default; }
    .secondary { background: none; color: ${T.gold}; border: 1px solid ${T.gold}; border-radius: 99px;
      padding: 12px 26px; font: inherit; letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px;
      cursor: pointer; margin-top: 22px; }
    .secondary:hover { background: rgba(212,175,55,.08); }
    .secondary:disabled { color:${T.faint}; border-color:${T.line}; cursor:default; background:none; }
    .ghost { background: none; border: none; color: ${T.faint}; font: inherit; cursor: pointer; padding: 10px 0; letter-spacing: .06em; }
    .ghost:hover { color: ${T.ink}; }
    .linkGold { background:none; border:none; font:inherit; font-size:12px; letter-spacing:.1em; text-transform:uppercase;
      color:${T.gold}; cursor:pointer; padding:4px 0; }
    .linkGold:disabled { color:${T.line}; cursor:default; }

    .codeInput { width: 100%; background: transparent; border: none; border-bottom: 1px solid ${T.gold};
      font-family: 'Marcellus', serif; font-size: 28px; letter-spacing: 0.5em; padding: 8px 0;
      color: ${T.ink}; text-align: center; text-transform: uppercase; }
    .err { color: ${T.red}; font-size: 12px; margin-top: 6px; }

    .banner { border:1px solid ${T.gold}; border-radius:2px; padding:16px 20px; margin-top:26px;
      display:flex; gap:14px; align-items:baseline; flex-wrap:wrap; }
    .banner b { font-weight:500; color:${T.gold}; }

    .orderRow { padding: 20px 0; border-bottom: 1px solid ${T.line}; }
    .orderHead { display: flex; align-items: baseline; gap: 18px; cursor: pointer; background: none; border: none;
      font: inherit; width: 100%; text-align: left; color: inherit; padding: 0; flex-wrap: wrap; }
    .chip { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; letter-spacing: 0.06em; }
    .deliv { font-size: 11px; color: ${T.faint}; letter-spacing: .04em; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1px;
      background: ${T.line}; border: 1px solid ${T.line}; margin-top: 26px; }
    .stat { background: ${T.card}; padding: 24px 22px; }
    .stat .n { font-family: 'Marcellus', serif; font-size: 34px; margin-top: 8px; }

    table.t { width:100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
    table.t th { text-align:left; font-weight:400; font-size:11px; letter-spacing:.18em; text-transform:uppercase;
      color:${T.faint}; padding: 10px 14px 10px 0; border-bottom:1px solid ${T.line}; }
    table.t td { padding: 11px 14px 11px 0; border-bottom:1px solid ${T.line}; vertical-align: baseline; }
    table.t td.num { font-variant-numeric: tabular-nums; }

    .procItem { border:1px solid ${T.line}; background:${T.card}; padding:16px 18px; margin-top:10px; }
    .procItem.errLine { border-color:${T.red}; }
    .procGrid { display:grid; grid-template-columns: 1.6fr repeat(4, minmax(64px, 90px)); gap:8px 18px; align-items:baseline; }
    .fieldLbl { font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:${T.faint}; display:block; margin-bottom:3px; }
    .numIn, .selIn, .txtIn, .dateIn { background:transparent; border:none; border-bottom:1px solid ${T.line}; font:inherit;
      color:${T.ink}; padding:4px 0; width:100%; }
    .minIn { background:transparent; border:none; border-bottom:1px dotted ${T.line}; font:inherit; color:${T.ink};
      width:44px; padding:2px 0; font-variant-numeric: tabular-nums; }
    .selIn { appearance:none; border-radius:0; }
    .selIn option { background:${T.card}; color:${T.ink}; }
    .dateIn { color-scheme: dark; }
    .short { color:${T.copper}; }
    .full { color:${T.sage}; }
    .cmp { font-size:11px; color:${T.faint}; margin-top:3px; }
    .cmp b { font-weight:500; color:${T.copper}; }

    .step { display:flex; gap:10px; align-items:center; color:${T.faint}; font-size:12px; letter-spacing:.1em; text-transform:uppercase; margin:26px 0 8px; flex-wrap:wrap; }
    .step .cur { color:${T.gold}; }

    .loginWrap { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 24px; text-align:center; }
    .loginMark { font-size:44px; letter-spacing:.22em; }
    .loginMark small { display:block; font-size:12px; letter-spacing:.34em; color:${T.gold}; margin-top:10px; font-family:'Jost'; }
    .roles { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1px; background:${T.line};
      border:1px solid ${T.line}; margin-top:56px; width:min(760px, 100%); }
    .roleCard { background:${T.card}; padding:34px 26px; cursor:pointer; border:none; font:inherit; color:${T.ink};
      text-align:left; transition: background .2s; }
    .roleCard:hover { background:#1A1A1A; }
    .roleCard .r { font-family:'Marcellus', serif; font-size:21px; margin:8px 0 6px; }
    .roleCard .who { color:${T.faint}; font-size:13px; }

    @media (max-width: 760px) {
      .shell { padding: 0 18px 60px; }
      h1.page { font-size: 30px; } .hero { font-size: 32px; }
      .procGrid { grid-template-columns: 1fr 1fr; }
      table.t { font-size: 13px; }
    }
  `;

  /* ═════════ LOGIN ═════════ */
  if (!session) {
    return (
      <div className="app">
        <style>{css}</style>
        <div className="loginWrap">
          <div className="display loginMark">AMARA<small>CENTRAL SUPPLY</small></div>
          <p className="sub" style={{ marginTop: 26 }}>
            Internal procurement for all Amara branches. Choose a role — each signs in as a real user with live shared data.
          </p>
          <div className="roles">
            {SWITCHABLE.map((u) => (
              <button key={u.name} className="roleCard" onClick={() => signIn(u)}>
                <span className="eyebrow">{u.place}</span>
                <div className="r">{u.role}</div>
                <div className="who">Sign in as {u.name}</div>
              </button>
            ))}
          </div>
          <p style={{ color: T.faint, fontSize: 12, marginTop: 34 }}>Demo build · no password required</p>
        </div>
      </div>
    );
  }

  const role = session.role;
  const tabs =
    role === "Purchase Manager" ? ["Catalogue", "Orders", "Dashboard"]
    : role === "Warehouse Manager" ? ["Queue", "Outstanding", "Inventory", "Import", "Log"]
    : ["Overview", "Products", "Users", "Codes", "Audit Log"];
  const curTab = role === "Purchase Manager" ? tab : role === "Warehouse Manager" ? wTab : aTab;
  const setCur = role === "Purchase Manager" ? setTab : role === "Warehouse Manager" ? setWTab : setATab;

  return (
    <div className="app">
      <style>{css}</style>
      <div className="shell">
        <header className="top hairline-b">
          <div className="display wordmark">AMARA<small>CENTRAL SUPPLY</small></div>
          <div style={{ display: "flex", gap: 26, alignItems: "baseline", flexWrap: "wrap" }}>
            <nav className="tabs" aria-label="Sections">
              {tabs.map((t) => (
                <button key={t} className={`tab ${curTab === t ? "on" : ""}`} onClick={() => setCur(t)}>
                  {t}
                  {role === "Purchase Manager" && t === "Orders" && shortageCount > 0 && <span className="badge">{shortageCount}</span>}
                  {role === "Warehouse Manager" && t === "Queue" && queue.length > 0 && <span className="badge">{queue.length}</span>}
                  {role === "Warehouse Manager" && t === "Outstanding" && outstanding.length > 0 && <span className="badge">{outstanding.length}</span>}
                </button>
              ))}
            </nav>
            {role === "Purchase Manager" && (
              <button className="cartBtn" onClick={() => setCartOpen(true)}>Cart · {cartCount}</button>
            )}
            <select className="roleSel" value={session.name} aria-label="Switch role"
              onChange={(e) => signIn(SWITCHABLE.find((u) => u.name === e.target.value), true)}>
              {SWITCHABLE.map((u) => <option key={u.name} value={u.name}>{u.name} — {u.role}</option>)}
            </select>
            <button className="ghost" onClick={signOut} style={{ padding: 0 }}>Sign out</button>
          </div>
        </header>

        {/* ═════════ PURCHASE MANAGER ═════════ */}
        {role === "Purchase Manager" && tab === "Catalogue" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>{session.place} branch</Eyebrow>
            <h1 className="display page">Product Catalogue</h1>
            <p className="sub">Quantities shown are what the warehouse can promise today — physical stock minus what other branches have already reserved.</p>
            <div className="toolRow">
              <input className="search" placeholder="Search name, brand or SKU" value={query}
                onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
              <div className="viewToggle" role="group" aria-label="View">
                <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>Grid</button>
                <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
              </div>
            </div>
            <div className="cats hairline-b">
              {CATEGORIES.map((c) => (
                <button key={c} className={`catLink ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>

            {Object.entries(grouped).map(([section, items]) => (
              <section key={section}>
                <div className="sectionHead">
                  <h2 className="display" style={{ fontSize: 22, margin: 0 }}>{section}</h2>
                  <span className="n">{items.length} PRODUCT{items.length === 1 ? "" : "S"}</span>
                </div>

                {view === "grid" ? (
                  <div className="grid">
                    {items.map((p) => {
                      const s = availState(p), meta = STOCK_META[s];
                      const avail = availableFor(p), res = reservedFor(p.id);
                      return (
                        <article key={p.id} className="card">
                          <ProductImage product={p} />
                          <div className="sku">{p.sku}</div>
                          <div className="pname">{p.name}</div>
                          <div className="brand">{p.brand} · per {p.unit}</div>
                          <div className="cardFoot">
                            <span className="stockRow" title={res > 0 ? `${p.stock} in stock, ${res} reserved by open orders` : undefined}>
                              <Dot color={meta.color} /> {meta.label}{s !== "out" ? ` · ${avail}` : ""}{res > 0 && s !== "out" ? ` (${res} reserved)` : ""}
                            </span>
                            {s !== "out" ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <Stepper value={qty[p.id] || 1} max={avail} onChange={(n) => setQty((m) => ({ ...m, [p.id]: n }))} />
                                <button className="add" onClick={() => addToCart(p)}>Add</button>
                              </span>
                            ) : (
                              <span className="stockRow" style={{ fontStyle: "italic" }}>Backorder via warehouse</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    {items.map((p) => {
                      const s = availState(p), meta = STOCK_META[s];
                      const avail = availableFor(p);
                      return (
                        <div key={p.id} className="listRow">
                          <ProductImage product={p} small />
                          <div style={{ minWidth: 0 }}>
                            <div className="pname">{p.name}</div>
                            <div className="sku">{p.sku} · {p.brand}</div>
                          </div>
                          <Leader />
                          <span className="stockRow"><Dot color={meta.color} /> {avail}</span>
                          {s !== "out" ? (
                            <>
                              <Stepper value={qty[p.id] || 1} max={avail} onChange={(n) => setQty((m) => ({ ...m, [p.id]: n }))} />
                              <button className="add" onClick={() => addToCart(p)}>Add</button>
                            </>
                          ) : (
                            <span className="stockRow" style={{ fontStyle: "italic" }}>Backorder</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
            {filtered.length === 0 && (
              <p style={{ color: T.faint, marginTop: 40 }}>No products match "{query}". Try a different name or SKU.</p>
            )}
          </>
        )}

        {role === "Purchase Manager" && tab === "Orders" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>{session.place} branch</Eyebrow>
            <h1 className="display page">Order History</h1>
            {myShortages.length > 0 && (
              <div className="banner">
                <b>Shortage notice</b>
                <span className="sub" style={{ maxWidth: "none" }}>
                  {myShortages.flatMap((o) =>
                    o.items.filter((it) => it.del < it.req)
                      .map((it) => `${it.req - it.del} × ${it.name} outstanding on ${o.id}${it.eta ? ` — expected ${fmtDate(it.eta)}` : ""}`)
                  ).join(" · ")}
                </span>
              </div>
            )}
            <input className="search" placeholder="Search orders by ID or product" value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)} aria-label="Search orders" />
            <div style={{ marginTop: 20 }}>
              {myOrders.length === 0 && <p style={{ color: T.faint, marginTop: 30 }}>{orderQuery ? `No orders match "${orderQuery}".` : "No orders yet. Build one from the catalogue."}</p>}
              {myOrders.map((o) => (
                <div key={o.id} className="orderRow">
                  <button className="orderHead" onClick={() => setOpenOrder(openOrder === o.id ? null : o.id)} aria-expanded={openOrder === o.id}>
                    <span className="display" style={{ fontSize: 19 }}>{o.id}</span>
                    <span style={{ color: T.faint, fontSize: 13 }}>{o.date}</span>
                    <span style={{ marginLeft: "auto" }}><Chip status={o.status} /></span>
                  </button>
                  {openOrder === o.id && (
                    <div style={{ marginTop: 14, maxWidth: 640 }}>
                      {o.items.map((it) => (
                        <div key={it.name}>
                          <div className="menuLine">
                            <span>{it.name}{it.note && <span className="noteText"> — "{it.note}"</span>}</span>
                            <Leader />
                            <span className="qtyMark">
                              {o.status === "Pending" ? `${it.req} requested`
                                : o.status === "Cancelled" ? `${it.req} — cancelled`
                                : <>
                                    <span className={it.del === it.req ? "full" : ""}>{it.del}/{it.req}</span> delivered
                                    {o.status === "Processing" && it.del < it.req && <span> · in progress</span>}
                                    {o.status === "Partially Fulfilled" && it.del < it.req &&
                                      <span className="short"> · {it.req - it.del} outstanding{it.eta ? `, expected ${fmtDate(it.eta)}` : ""}</span>}
                                  </>}
                            </span>
                          </div>
                          {it.deliveries.length > 1 && (
                            <div className="deliv" style={{ margin: "-6px 0 6px" }}>
                              {it.deliveries.map((d, i) => `${d.qty} on ${d.time}`).join(" · ")}
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 26, alignItems: "baseline" }}>
                        <button className="linkGold" onClick={() => reorder(o)}>Reorder these items</button>
                        {o.status === "Pending" && (
                          <Confirm label="Cancel order" confirm="Confirm cancel?" danger onConfirm={() => cancelOrder(o)} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {role === "Purchase Manager" && tab === "Dashboard" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>{session.place} branch · Thursday 16 July</Eyebrow>
            <h1 className="display hero">
              Good morning, {session.name.split(" ")[0]}.{" "}
              <em>{orders.filter((o) => o.branch === session.place && ["Pending", "Processing"].includes(o.status)).length} order{orders.filter((o) => o.branch === session.place && ["Pending", "Processing"].includes(o.status)).length === 1 ? "" : "s"} in motion</em>
              {shortageCount > 0 && <>, {shortageCount} line{shortageCount === 1 ? "" : "s"} on the way behind them</>}.
            </h1>
            {myShortages.length > 0 && (
              <div className="banner">
                <b>Waiting on</b>
                <span className="sub" style={{ maxWidth: "none" }}>
                  {myShortages.flatMap((o) =>
                    o.items.filter((it) => it.del < it.req).map((it) => `${it.req - it.del} × ${it.name}${it.eta ? ` (${fmtDate(it.eta)})` : ""}`)
                  ).join(" · ")}
                </span>
              </div>
            )}
            <div className="stats">
              {[
                ["Orders in motion", orders.filter((o) => o.branch === session.place && ["Pending", "Processing"].includes(o.status)).length],
                ["Outstanding lines", shortageCount],
                ["Orders this month", orders.filter((o) => o.branch === session.place && o.status !== "Cancelled").length],
                ["Catalogue low stock", lowList.length],
              ].map(([label, n]) => (
                <div key={label} className="stat"><div className="eyebrow">{label}</div><div className="n">{n}</div></div>
              ))}
            </div>
            <Eyebrow style={{ marginTop: 44, marginBottom: 6 }}>Frequently ordered</Eyebrow>
            <div style={{ maxWidth: 580 }}>
              {[products[0], products[4], products[47]].filter(Boolean).map((p) => (
                <div key={p.id} className="menuLine" style={{ borderTop: `1px solid ${T.line}` }}>
                  <span>{p.name}</span>
                  <Leader />
                  <button className="add" onClick={() => { addToCart(p, 1); setCartOpen(true); }}>Quick add</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═════════ WAREHOUSE MANAGER ═════════ */}
        {role === "Warehouse Manager" && wTab === "Queue" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Central Warehouse · Thursday 16 July</Eyebrow>
            <h1 className="display hero">
              {queue.length === 0 ? <>The queue is <em>clear</em>.</> : <><em>{queue.length} order{queue.length === 1 ? "" : "s"}</em> waiting on the floor.</>}
            </h1>
            {queue.length === 0 && <p className="sub">New orders from the branches will appear here the moment they're authorized.</p>}

            {queue.map((o) => {
              const open = openJob === o.id;
              const d = draft[o.id] || draftFor(o);
              const totalRemaining = o.items.reduce((s, it) => s + (it.req - it.del), 0);
              const draftTotal = o.items.reduce((s, it, i) => s + (d[i]?.dispatch || 0), 0);
              return (
                <div key={o.id} className="orderRow">
                  <button className="orderHead" onClick={() => setOpenJob(open ? null : o.id)} aria-expanded={open}>
                    <span className="display" style={{ fontSize: 19 }}>{o.id}</span>
                    <span style={{ color: T.faint, fontSize: 13 }}>{o.branch} · {o.placedBy} · {o.date}</span>
                    <span style={{ color: T.faint, fontSize: 13 }}>{totalRemaining} unit{totalRemaining === 1 ? "" : "s"} remaining</span>
                    <span style={{ marginLeft: "auto" }}><Chip status={o.status} /></span>
                  </button>

                  {open && (
                    <div style={{ marginTop: 10 }}>
                      {o.items.map((it, i) => {
                        const p = prod(it.pid);
                        const stock = p ? p.stock : 0;
                        const remaining = it.req - it.del;
                        const max = Math.min(remaining, stock);
                        const line = d[i];
                        const dispatch = line?.dispatch ?? 0;
                        const shortAfter = remaining - dispatch;
                        const limiter = remaining === 0 ? null : stock < remaining ? "stock" : "request";
                        return (
                          <div key={i} className={`procItem ${line?.err ? "errLine" : ""}`}>
                            <div className="procGrid">
                              <div>
                                <div className="pname">{it.name}</div>
                                {it.note && <div className="noteText">"{it.note}"</div>}
                                {it.deliveries.length > 0 && (
                                  <div className="deliv">{it.deliveries.map((dv) => `${dv.qty} sent ${dv.time}`).join(" · ")}</div>
                                )}
                              </div>
                              <div><span className="fieldLbl">Requested</span><span className="qtyMark" style={{ fontSize: 15, color: T.ink }}>{it.req}</span></div>
                              <div><span className="fieldLbl">Remaining</span><span className="qtyMark" style={{ fontSize: 15, color: remaining > 0 ? T.ink : T.sage }}>{remaining}</span></div>
                              <div><span className="fieldLbl">In stock</span><span className="qtyMark" style={{ fontSize: 15, color: stock < remaining ? T.copper : T.ink }}>{stock}</span></div>
                              <div>
                                <span className="fieldLbl">Dispatch now</span>
                                {o.status === "Processing" && remaining > 0 ? (
                                  <>
                                    <input type="number" className="numIn" min={0} max={max} value={dispatch}
                                      aria-label={`Dispatch quantity for ${it.name}, maximum ${max}`}
                                      onChange={(e) => setD(o.id, i, { dispatch: Math.max(0, Math.min(max, Number(e.target.value) || 0)), err: false })} />
                                    <div className="cmp">
                                      max {max}{limiter === "stock" && <b> — stock-limited</b>}
                                    </div>
                                  </>
                                ) : (
                                  <span className="qtyMark" style={{ fontSize: 15, color: T.sage }}>{remaining === 0 ? "done" : dispatch}</span>
                                )}
                              </div>
                            </div>

                            {o.status === "Processing" && shortAfter > 0 && (
                              <div className="procGrid" style={{ marginTop: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
                                <div>
                                  <span className="fieldLbl short">Will remain short · {shortAfter}</span>
                                  <select className="selIn" value={line?.reason || ""} onChange={(e) => setD(o.id, i, { reason: e.target.value, err: false })}>
                                    <option value="">Reason (needed to close)…</option>
                                    {REASONS.map((r) => <option key={r}>{r}</option>)}
                                  </select>
                                  {line?.err && <p className="err">Select a reason before closing this order.</p>}
                                </div>
                                <div>
                                  <span className="fieldLbl">Expected availability</span>
                                  <input type="date" className="dateIn" value={line?.eta || ""} onChange={(e) => setD(o.id, i, { eta: e.target.value })} />
                                </div>
                                <div>
                                  <span className="fieldLbl">Remarks</span>
                                  <input className="txtIn" placeholder="Optional" value={line?.remark || ""} onChange={(e) => setD(o.id, i, { remark: e.target.value })} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {o.status === "Pending" ? (
                        <button className="primary" onClick={() => startProcessing(o)}>Start processing</button>
                      ) : (
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
                          <button className="secondary" disabled={draftTotal === 0 || draftTotal === totalRemaining}
                            onClick={() => applyDispatch(o, false)}>
                            Dispatch {draftTotal} now — keep open
                          </button>
                          <Confirm kind="primary"
                            label={draftTotal === totalRemaining ? `Dispatch all & complete` : `Close order — ${totalRemaining - draftTotal} outstanding`}
                            confirm="Confirm — this settles the order"
                            onConfirm={() => applyDispatch(o, true)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {role === "Warehouse Manager" && wTab === "Outstanding" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Central Warehouse</Eyebrow>
            <h1 className="display page">Outstanding Items</h1>
            <p className="sub">Everything still owed to the branches. Fulfil a line when stock lands — the delivery is timestamped and the branch sees it immediately.</p>
            {outstanding.length === 0 ? (
              <p style={{ color: T.faint, marginTop: 36 }}>Nothing is owed. Every order has been dispatched in full.</p>
            ) : (
              <table className="t">
                <thead><tr><th>Product</th><th>Order</th><th>Branch</th><th>Owed</th><th>Reason</th><th>Expected</th><th></th></tr></thead>
                <tbody>
                  {outstanding.map((r, i) => {
                    const p = prod(r.pid);
                    const need = r.req - r.del;
                    const can = p && p.stock >= need;
                    return (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td className="qtyMark">{r.orderId}</td>
                        <td style={{ color: T.faint }}>{r.branch}</td>
                        <td className="num short">{need}</td>
                        <td style={{ color: T.faint }}>{r.reason || "—"}</td>
                        <td style={{ color: T.faint }}>{fmtDate(r.eta) || "—"}</td>
                        <td>
                          {can
                            ? <Confirm label="Fulfil now" confirm={`Send ${need}?`} onConfirm={() => fulfilOutstanding(r)} />
                            : <span className="linkGold" style={{ color: T.line, cursor: "default" }}>Stock: {p ? p.stock : 0}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {role === "Warehouse Manager" && wTab === "Inventory" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Central Warehouse</Eyebrow>
            <h1 className="display page">Inventory</h1>
            <p className="sub">Reserved = committed to open orders. Available = stock − reserved, which is what branches see. Minimum stock is editable inline.</p>
            <div className="cats hairline-b">
              {["All", "Low stock", "Out of stock"].map((f) => (
                <button key={f} className={`catLink ${invFilter === f ? "on" : ""}`} onClick={() => setInvFilter(f)}>{f}</button>
              ))}
              <span style={{ marginLeft: "auto" }}>
                <button className="linkGold" onClick={() => log("Exported inventory to Excel")}>Export Excel</button>
              </span>
            </div>
            <table className="t">
              <thead><tr><th>SKU</th><th>Product</th><th>Stock</th><th>Reserved</th><th>Available</th><th>Min</th><th>Status</th><th>Adjust</th></tr></thead>
              <tbody>
                {products
                  .filter((p) => invFilter === "All" || (invFilter === "Low stock" ? availState(p) === "low" : availState(p) === "out"))
                  .map((p) => {
                    const s = availState(p), meta = STOCK_META[s];
                    const res = reservedFor(p.id);
                    return (
                      <tr key={p.id} style={{ opacity: p.active ? 1 : 0.4 }}>
                        <td className="sku">{p.sku}</td>
                        <td>{p.name}</td>
                        <td className="num">{p.stock}</td>
                        <td className="num" style={{ color: res > 0 ? T.copper : T.faint }}>{res}</td>
                        <td className="num">{availableFor(p)}</td>
                        <td>
                          <input type="number" className="minIn" value={p.min} min={0}
                            aria-label={`Minimum stock for ${p.name}`}
                            onChange={(e) => setMin(p, Number(e.target.value) || 0)} />
                        </td>
                        <td><span className="stockRow"><Dot color={meta.color} /> {meta.label}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="ghost" style={{ padding: "0 10px 0 0" }} onClick={() => adjustStock(p, -1)}>−</button>
                          <button className="ghost" style={{ padding: 0 }} onClick={() => adjustStock(p, +1)}>+</button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </>
        )}

        {role === "Warehouse Manager" && wTab === "Import" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Central Warehouse</Eyebrow>
            <h1 className="display page">Inventory Import</h1>
            <div className="step">
              {["Upload", "Validate & preview", "Confirm", "Summary"].map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && <span>·</span>}
                  <span className={imp.step === i || (i === 2 && imp.step === 1) ? "cur" : ""}>{s}</span>
                </React.Fragment>
              ))}
            </div>

            {imp.step === 0 && (
              <>
                <p className="sub">Upload an Excel or CSV file to update stock levels, create products, or synchronize after a stock audit.</p>
                <Eyebrow style={{ marginTop: 30, marginBottom: 8 }}>Import mode</Eyebrow>
                <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
                  {["Inventory Update", "Product Import", "Full Synchronization"].map((m) => (
                    <button key={m} className={`catLink ${imp.mode === m ? "on" : ""}`} onClick={() => setImp((s) => ({ ...s, mode: m }))}>{m}</button>
                  ))}
                </div>
                <button className="primary" onClick={() => setImp((s) => ({ ...s, step: 1 }))}>
                  Select file — {IMPORT_FILE.name}
                </button>
                <p style={{ color: T.faint, fontSize: 12, marginTop: 12 }}>Demo: a sample July stock sheet is attached.</p>
              </>
            )}

            {imp.step === 1 && (
              <>
                <p className="sub">{IMPORT_FILE.name} · {IMPORT_FILE.rows.length} rows read · mode: {imp.mode}</p>
                {importCheck.errors.length > 0 && (
                  <div className="banner" style={{ borderColor: T.red }}>
                    <b style={{ color: T.red }}>{importCheck.errors.length} row{importCheck.errors.length === 1 ? "" : "s"} will be skipped</b>
                    <span className="sub" style={{ maxWidth: "none" }}>{importCheck.errors.join(" · ")}</span>
                  </div>
                )}
                {importCheck.warnings.length > 0 && (
                  <div className="banner" style={{ borderColor: T.copper }}>
                    <b style={{ color: T.copper }}>Warnings</b>
                    <span className="sub" style={{ maxWidth: "none" }}>{importCheck.warnings.join(" · ")}</span>
                  </div>
                )}
                <table className="t">
                  <thead><tr><th>SKU</th><th>Product</th><th>Current</th><th>New qty</th><th></th></tr></thead>
                  <tbody>
                    {importCheck.valid.map((r) => (
                      <tr key={r.sku}>
                        <td className="sku">{r.sku}</td>
                        <td>{r.name}</td>
                        <td className="num" style={{ color: T.faint }}>{r.current}</td>
                        <td className="num">{r.qty}</td>
                        <td style={{ color: T.gold, fontSize: 12, letterSpacing: ".1em" }}>{r.isNew ? "NEW" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <Confirm kind="primary" label={`Confirm import — ${importCheck.valid.length} rows`} confirm="Confirm — stock will be overwritten" onConfirm={confirmImport} />
                  <button className="ghost" onClick={() => setImp((s) => ({ ...s, step: 0 }))}>Back</button>
                </div>
              </>
            )}

            {imp.step === 3 && imp.summary && (
              <>
                <h2 className="display" style={{ fontSize: 30, margin: "20px 0 0" }}>Import complete</h2>
                <div className="stats" style={{ maxWidth: 760 }}>
                  {[["Updated", imp.summary.updated], ["Created", imp.summary.created], ["Failed", imp.summary.failed], ["Processing time", imp.summary.time]].map(([l, n]) => (
                    <div key={l} className="stat"><div className="eyebrow">{l}</div><div className="n">{n}</div></div>
                  ))}
                </div>
                <p className="sub" style={{ marginTop: 20 }}>Stock levels are live across all branches. This import was written to the audit and inventory logs.</p>
                <button className="ghost" onClick={() => setImp({ step: 0, mode: imp.mode, summary: null })}>Run another import</button>
              </>
            )}
          </>
        )}

        {role === "Warehouse Manager" && wTab === "Log" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Central Warehouse</Eyebrow>
            <h1 className="display page">Inventory Log</h1>
            <p className="sub">Every stock movement — dispatches, adjustments, imports and outstanding fulfilments — with previous and new levels.</p>
            <table className="t">
              <thead><tr><th>Time</th><th>User</th><th>Product</th><th>Prev</th><th>New</th><th>Action</th></tr></thead>
              <tbody>
                {movements.map((m, i) => (
                  <tr key={i}>
                    <td className="qtyMark">{m.time}</td>
                    <td style={{ color: T.faint }}>{m.user}</td>
                    <td>{m.product}</td>
                    <td className="num" style={{ color: T.faint }}>{m.prev}</td>
                    <td className="num">{m.next}</td>
                    <td style={{ color: T.faint }}>{m.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ═════════ SUPER ADMIN ═════════ */}
        {role === "Super Admin" && aTab === "Overview" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Head Office · Thursday 16 July</Eyebrow>
            <h1 className="display hero">
              <em>{orders.filter((o) => o.status !== "Cancelled").length} orders</em> across {new Set(orders.map((o) => o.branch)).size} branches, {outstanding.length} line{outstanding.length === 1 ? "" : "s"} still owed.
            </h1>
            <div className="stats">
              {[
                ["Total orders", orders.length],
                ["Outstanding lines", outstanding.length],
                ["Low / out of stock", lowList.length],
                ["Active users", USERS.length],
                ["Active products", activeProducts.length],
              ].map(([l, n]) => (
                <div key={l} className="stat"><div className="eyebrow">{l}</div><div className="n">{n}</div></div>
              ))}
            </div>
            <Eyebrow style={{ marginTop: 44, marginBottom: 6 }}>Most ordered this month</Eyebrow>
            <div style={{ maxWidth: 580 }}>
              {["Colour Tube — 6.35 Chestnut", "Repair Shampoo 1L", "Nitrile Gloves M (100)"].map((n, i) => (
                <div key={n} className="menuLine" style={{ borderTop: `1px solid ${T.line}` }}>
                  <span>{n}</span><Leader /><span className="qtyMark">{[30, 20, 16][i]} units</span>
                </div>
              ))}
            </div>
          </>
        )}

        {role === "Super Admin" && aTab === "Products" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Head Office</Eyebrow>
            <h1 className="display page">Products</h1>
            <p className="sub">Deactivated products disappear from the branch catalogue immediately but keep their history.</p>
            <table className="t">
              <thead><tr><th>SKU</th><th>Product</th><th>Section</th><th>Stock</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} style={{ opacity: p.active ? 1 : 0.45 }}>
                    <td className="sku">{p.sku}</td>
                    <td>{p.name}</td>
                    <td style={{ color: T.faint }}>{p.cat}</td>
                    <td className="num">{p.stock}</td>
                    <td style={{ color: p.active ? T.sage : T.faint }}>{p.active ? "Active" : "Inactive"}</td>
                    <td>
                      {p.active
                        ? <Confirm label="Deactivate" confirm="Hide from branches?" onConfirm={() => toggleActive(p)} />
                        : <button className="linkGold" onClick={() => toggleActive(p)}>Activate</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {role === "Super Admin" && aTab === "Users" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Head Office</Eyebrow>
            <h1 className="display page">Users & Salons</h1>
            <table className="t">
              <thead><tr><th>Name</th><th>Role</th><th>Location</th></tr></thead>
              <tbody>
                {USERS.map((u) => (
                  <tr key={u.name}><td>{u.name}</td><td style={{ color: T.faint }}>{u.role}</td><td style={{ color: T.faint }}>{u.place}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {role === "Super Admin" && aTab === "Codes" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Head Office</Eyebrow>
            <h1 className="display page">Authorization Codes</h1>
            <p className="sub">Each Purchase Manager submits orders with a code. Rotate them any time — old codes stop working immediately.</p>
            <button className="primary" onClick={generateCode}>Generate new code</button>
            <div style={{ maxWidth: 420, marginTop: 26 }}>
              {codes.map((c, i) => (
                <div key={c} className="menuLine" style={{ borderTop: `1px solid ${T.line}` }}>
                  <span className="display" style={{ letterSpacing: ".2em" }}>{c}</span>
                  <Leader />
                  <span className="qtyMark">{i === 0 ? "newest" : "active"}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {role === "Super Admin" && aTab === "Audit Log" && (
          <>
            <Eyebrow style={{ marginTop: 34 }}>Head Office</Eyebrow>
            <h1 className="display page">Audit Log</h1>
            <p className="sub">Every meaningful action across all roles, newest first. Try acting in another role and returning here.</p>
            <input className="search" placeholder="Filter by user or action" value={auditQuery}
              onChange={(e) => setAuditQuery(e.target.value)} aria-label="Filter audit log" />
            <table className="t">
              <thead><tr><th style={{ width: 70 }}>Time</th><th style={{ width: 130 }}>User</th><th>Action</th></tr></thead>
              <tbody>
                {audit
                  .filter((a) => {
                    const q = auditQuery.trim().toLowerCase();
                    return !q || a.user.toLowerCase().includes(q) || a.action.toLowerCase().includes(q);
                  })
                  .map((a, i) => (
                    <tr key={i}><td className="qtyMark">{a.time}</td><td style={{ color: T.gold }}>{a.user}</td><td style={{ color: T.faint }}>{a.action}</td></tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ═════════ CART DRAWER (PM) ═════════ */}
      {role === "Purchase Manager" && (
        <>
          <div className={`scrim ${cartOpen ? "on" : ""}`} onClick={closeCart} />
          <aside className={`drawer ${cartOpen ? "on" : ""}`} aria-label="Cart" aria-hidden={!cartOpen}>
            {checkout === "cart" && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <h2 className="display" style={{ fontSize: 26, margin: 0 }}>Your Order</h2>
                  <button className="ghost" onClick={closeCart}>Close</button>
                </div>
                <Eyebrow style={{ marginTop: 6 }}>{cartCount} item{cartCount === 1 ? "" : "s"} · {session.place}</Eyebrow>
                <div style={{ marginTop: 18, flex: 1 }}>
                  {cart.length === 0 && <p style={{ color: T.faint, marginTop: 30 }}>Your order is empty. Add products from the catalogue to begin.</p>}
                  {cart.map((l) => {
                    const p = prod(l.pid);
                    const avail = availableFor(p) + l.qty; /* their own cart isn't reserved yet */
                    return (
                      <div key={l.pid} style={{ borderBottom: `1px solid ${T.bg}` }}>
                        <div className="menuLine" style={{ flexWrap: "wrap", gap: 8, borderTop: "none" }}>
                          <span style={{ maxWidth: "56%" }}>{p.name}</span>
                          <Leader />
                          <Stepper value={l.qty} max={Math.max(1, avail)} onChange={(n) => updateLine(l.pid, { qty: n })} />
                        </div>
                        <div style={{ display: "flex", gap: 16, paddingBottom: 10 }}>
                          <button className="noteBtn" onClick={() => setNoteOpen(noteOpen === l.pid ? null : l.pid)}>{l.note ? "Edit note" : "Add note"}</button>
                          <button className="remove" onClick={() => removeLine(l.pid)}>Remove</button>
                        </div>
                        {noteOpen === l.pid ? (
                          <input className="noteField" placeholder="Note for the warehouse — e.g. shade, urgency"
                            value={l.note} autoFocus
                            onChange={(e) => updateLine(l.pid, { note: e.target.value })}
                            onBlur={() => setNoteOpen(null)}
                            onKeyDown={(e) => e.key === "Enter" && setNoteOpen(null)} />
                        ) : (
                          l.note && <p className="noteText" style={{ margin: "0 0 10px" }}>"{l.note}"</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {cart.length > 0 && <button className="primary" onClick={() => setCheckout("auth")}>Continue to authorization</button>}
              </>
            )}

            {checkout === "auth" && (
              <>
                <h2 className="display" style={{ fontSize: 26, margin: 0 }}>Authorize Purchase</h2>
                <p className="sub" style={{ marginTop: 10 }}>Enter your purchase authorization code. Submitting reserves the stock for your branch immediately.</p>
                <div style={{ marginTop: 46 }}>
                  <input className="codeInput" maxLength={9} value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)} placeholder="••••••" aria-label="Authorization code" />
                  {authError && <p className="err">{authError}</p>}
                </div>
                <button className="primary" onClick={submitAuth}>Submit order</button>
                <button className="ghost" onClick={() => setCheckout("cart")}>Back to order</button>
                <p style={{ color: T.faint, fontSize: 12, marginTop: "auto" }}>Demo: any code of 6+ characters validates (e.g. ROSE-4821).</p>
              </>
            )}

            {checkout === "done" && (
              <>
                <Eyebrow style={{ marginTop: 30 }}>Order {placedId}</Eyebrow>
                <h2 className="display" style={{ fontSize: 30, margin: "8px 0 0" }}>Sent to the warehouse</h2>
                <p className="sub" style={{ marginTop: 14 }}>
                  Your order is in the queue as {placedId} and its stock is reserved. Switch to the Warehouse Manager role (top right) to process it, then return here to watch the status change.
                </p>
                <button className="primary" onClick={() => { closeCart(); setTab("Orders"); setOpenOrder(placedId); }}>View order</button>
                <button className="ghost" onClick={closeCart}>Keep browsing</button>
              </>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
