export interface Order {
  row: number;
  orderId: string;
  sku: string;
  productName: string;
  buyer: string;
  qty: number;
  orderDate: Date | null;
  pickupDate: Date | null;
  shipped: boolean;
  status: string;
}

export interface Nickname {
  sku: string;
  nickname: string;
  color: string;
}

export const REQUIRED_COLUMNS = ['SKU', 'Order ID', 'Order Date', 'Pickup Date', 'Shipped'];

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/** Accepts Sheets serial numbers (UNFORMATTED_VALUE) or common text formats like "31-Oct-2026 21:35". */
export function parseCellDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const utc = new Date(Math.round((value - 25569) * 86400000));
    return new Date(
      utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(),
      utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(),
    );
  }
  const text = String(value).trim();
  let m = text.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]+(\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (month == null) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, month, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  }
  m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : new Date(t);
}

export function parseBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const t = String(value ?? '').trim().toLowerCase();
  return t === 'true' || t === 'yes' || t === 'y' || t === '1' || t === '✓' || t === 'shipped';
}

const norm = (h: unknown) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function parseOrders(headers: unknown[], rows: unknown[][]): { orders: Order[]; missing: string[] } {
  const lower = headers.map(norm);
  const col = (name: string) => lower.indexOf(name.toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => col(c) < 0);
  const c = {
    id: col('Order ID'), sku: col('SKU'), product: col('Product Name'), buyer: col('Buyer Name'), qty: col('Qty'),
    orderDate: col('Order Date'), pickup: col('Pickup Date'), shipped: col('Shipped'), status: col('Status'),
  };
  const get = (r: unknown[], i: number) => (i < 0 ? undefined : r[i]);
  const str = (v: unknown) => String(v ?? '').trim();
  const orders: Order[] = [];
  rows.forEach((r, i) => {
    const orderId = str(get(r, c.id));
    const sku = str(get(r, c.sku));
    if (!orderId && !sku) return;
    const qty = Number(get(r, c.qty));
    orders.push({
      row: i + 2,
      orderId,
      sku,
      productName: str(get(r, c.product)),
      buyer: str(get(r, c.buyer)),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      orderDate: parseCellDate(get(r, c.orderDate)),
      pickupDate: parseCellDate(get(r, c.pickup)),
      shipped: parseBool(get(r, c.shipped)),
      status: str(get(r, c.status)),
    });
  });
  return { orders, missing };
}

export const orderKey = (o: Pick<Order, 'orderId' | 'sku' | 'row'>) => `${o.orderId}|${o.sku}|${o.row}`;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export type TodoBucket = 'overdue' | 'today';

/**
 * Todo = unshipped orders whose pickup is today or earlier, plus today's pickups already shipped
 * (kept visible as done). `stickyKeys` keeps overdue orders ticked this session visible for undo.
 */
export function todoBucket(o: Order, today: Date, stickyKeys?: Set<string>): TodoBucket | null {
  if (!o.pickupDate) return null;
  const t = startOfDay(today).getTime();
  const p = startOfDay(o.pickupDate).getTime();
  if (p > t) return null;
  if (p === t) return 'today';
  if (!o.shipped || stickyKeys?.has(orderKey(o))) return 'overdue';
  return null;
}

export interface SkuGroup {
  sku: string;
  orders: Order[];
  units: number;
  done: number;
}

export function groupBySku(orders: Order[]): SkuGroup[] {
  const map = new Map<string, SkuGroup>();
  for (const o of orders) {
    const g = map.get(o.sku) ?? { sku: o.sku, orders: [], units: 0, done: 0 };
    g.orders.push(o);
    g.units += o.qty;
    if (o.shipped) g.done += 1;
    map.set(o.sku, g);
  }
  // Stable order (by order time) so a ticked line stays put and the next order never slides under the cursor.
  for (const g of map.values()) {
    g.orders.sort((a, b) => (a.orderDate?.getTime() ?? 0) - (b.orderDate?.getTime() ?? 0) || a.row - b.row);
  }
  return [...map.values()].sort((a, b) => b.orders.length - a.orders.length || a.sku.localeCompare(b.sku));
}

export interface Stats {
  total: number;
  units: number;
  shipped: number;
  unshipped: number;
  overdue: number;
  dueToday: number;
  shippedToday: number;
  dueTomorrow: number;
  orderedToday: number;
  multiUnit: number;
  avgPerDay: number;
  busiest: { day: string; count: number } | null;
  bySku: { sku: string; orders: number; units: number; shipped: number }[];
  perDay: { day: string; shipped: number; unshipped: number }[];
  byHour: number[];
  upcoming: { day: string; count: number; units: number; bySku: Record<string, number> }[];
  attention: Order[];
}

const OK_STATUS = new Set(['', 'new', 'shipped', 'printed', 'picked up', 'pickup confirmed', 'delivered', 'done']);

export function computeStats(all: Order[], today: Date, rangeDays: number | null, chartDays = 14): Stats {
  const t0 = startOfDay(today);
  const from = rangeDays ? addDays(t0, -(rangeDays - 1)) : null;
  const orders = from ? all.filter((o) => o.orderDate && o.orderDate >= from) : all;
  const tKey = dayKey(t0);
  const tomorrowKey = dayKey(addDays(t0, 1));

  const s: Stats = {
    total: orders.length, units: 0, shipped: 0, unshipped: 0,
    overdue: 0, dueToday: 0, shippedToday: 0, dueTomorrow: 0, orderedToday: 0,
    multiUnit: 0, avgPerDay: 0, busiest: null,
    bySku: [], perDay: [], byHour: Array(24).fill(0), upcoming: [], attention: [],
  };

  const sku = new Map<string, { sku: string; orders: number; units: number; shipped: number }>();
  const daily = new Map<string, number>();
  for (const o of orders) {
    s.units += o.qty;
    if (o.shipped) s.shipped++;
    else s.unshipped++;
    if (o.qty > 1) s.multiUnit++;
    const k = sku.get(o.sku) ?? { sku: o.sku, orders: 0, units: 0, shipped: 0 };
    k.orders++;
    k.units += o.qty;
    if (o.shipped) k.shipped++;
    sku.set(o.sku, k);
    if (o.orderDate) {
      s.byHour[o.orderDate.getHours()]++;
      const dk = dayKey(o.orderDate);
      daily.set(dk, (daily.get(dk) ?? 0) + 1);
      if (dk === tKey) s.orderedToday++;
    }
    if (!OK_STATUS.has(o.status.toLowerCase())) s.attention.push(o);
  }

  // Dispatch figures always reflect the whole sheet, not the analytics range.
  for (const o of all) {
    if (!o.pickupDate) continue;
    const pk = dayKey(o.pickupDate);
    if (pk === tKey) {
      s.dueToday++;
      if (o.shipped) s.shippedToday++;
    } else if (pk < tKey && !o.shipped) s.overdue++;
    else if (pk === tomorrowKey && !o.shipped) s.dueTomorrow++;
  }

  s.bySku = [...sku.values()].sort((a, b) => b.orders - a.orders);
  if (daily.size) {
    s.avgPerDay = orders.filter((o) => o.orderDate).length / daily.size;
    const [day, count] = [...daily.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
    s.busiest = { day, count };
  }

  for (let i = chartDays - 1; i >= 0; i--) {
    const key = dayKey(addDays(t0, -i));
    s.perDay.push({ day: key, shipped: 0, unshipped: 0 });
  }
  const perDayIndex = new Map(s.perDay.map((d, i) => [d.day, i]));
  for (const o of all) {
    if (!o.orderDate) continue;
    const i = perDayIndex.get(dayKey(o.orderDate));
    if (i == null) continue;
    if (o.shipped) s.perDay[i].shipped++;
    else s.perDay[i].unshipped++;
  }

  const up = new Map<string, { day: string; count: number; units: number; bySku: Record<string, number> }>();
  for (const o of all) {
    if (o.shipped || !o.pickupDate) continue;
    const pk = dayKey(o.pickupDate);
    if (pk <= tKey) continue;
    const u = up.get(pk) ?? { day: pk, count: 0, units: 0, bySku: {} };
    u.count++;
    u.units += o.qty;
    u.bySku[o.sku] = (u.bySku[o.sku] ?? 0) + o.qty;
    up.set(pk, u);
  }
  s.upcoming = [...up.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(0, 7);
  return s;
}

export type ShipFilter = 'all' | 'unshipped' | 'shipped';
export type DateField = 'orderDate' | 'pickupDate';

export interface OrderFilter {
  ship: ShipFilter;
  dateField: DateField;
  from: string;
  to: string;
  sku: string;
  query: string;
}

export function filterOrders(orders: Order[], f: OrderFilter, nicknameOf: (sku: string) => string): Order[] {
  const q = f.query.trim().toLowerCase();
  const from = f.from ? fromDayKey(f.from) : null;
  const to = f.to ? addDays(fromDayKey(f.to), 1) : null;
  return orders.filter((o) => {
    if (f.ship === 'shipped' && !o.shipped) return false;
    if (f.ship === 'unshipped' && o.shipped) return false;
    if (f.sku && o.sku !== f.sku) return false;
    if (from || to) {
      const d = o[f.dateField];
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d >= to) return false;
    }
    if (q) {
      const hay = `${o.orderId} ${o.sku} ${nicknameOf(o.sku)} ${o.buyer} ${o.productName} ${o.status}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export const SKU_COLORS = ['#5865f2', '#23a55a', '#f0b232', '#eb459e', '#00a8fc', '#f47b67', '#9b84ee', '#45ddc0', '#e67e22', '#f23f43'];

export function colorFor(sku: string, explicit?: string): string {
  if (explicit && /^#[0-9a-f]{6}$/i.test(explicit)) return explicit;
  let h = 0;
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SKU_COLORS[h % SKU_COLORS.length];
}

export function initials(label: string): string {
  const words = label.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function toCsv(orders: Order[], nicknameOf: (sku: string) => string): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const fmt = (d: Date | null) => (d ? `${dayKey(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '');
  const lines = [['Order ID', 'SKU', 'Nickname', 'Qty', 'Order Date', 'Pickup Date', 'Shipped', 'Status', 'Product Name']];
  for (const o of orders) {
    lines.push([o.orderId, o.sku, nicknameOf(o.sku), String(o.qty), fmt(o.orderDate), fmt(o.pickupDate), o.shipped ? 'TRUE' : 'FALSE', o.status, o.productName]);
  }
  return lines.map((l) => l.map(esc).join(',')).join('\r\n');
}
