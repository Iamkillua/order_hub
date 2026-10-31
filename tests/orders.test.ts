import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeStats, dayKey, filterOrders, groupBySku, parseBool, parseCellDate, parseOrders, todoBucket, toCsv, orderKey,
  type Order,
} from '../src/lib/orders.ts';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const table = parseCsv(readFileSync(new URL('../dev/sample-orders.csv', import.meta.url), 'utf8'));
const { orders, missing } = parseOrders(table[0], table.slice(1));

const order = (over: Partial<Order>): Order => ({
  row: 2, orderId: 'A', sku: 'S', productName: '', buyer: '', qty: 1,
  orderDate: null, pickupDate: null, shipped: false, status: 'New', ...over,
});

test('parseCellDate handles sheet text, ISO, dd/mm/yyyy and serials', () => {
  assert.deepEqual(parseCellDate('31-Oct-2026 21:35'), new Date(2026, 9, 31, 21, 35));
  assert.deepEqual(parseCellDate('02-Nov-2026 00:00'), new Date(2026, 10, 2));
  assert.deepEqual(parseCellDate('2026-11-04'), new Date(2026, 10, 4));
  assert.deepEqual(parseCellDate('04/11/2026 09:15'), new Date(2026, 10, 4, 9, 15));
  // 46326 = 2026-10-31, .5 = noon
  assert.deepEqual(parseCellDate(46326.5), new Date(2026, 9, 31, 12, 0));
  assert.equal(parseCellDate(''), null);
  assert.equal(parseCellDate('not a date'), null);
});

test('parseBool accepts sheet booleans and text', () => {
  assert.equal(parseBool(true), true);
  assert.equal(parseBool('TRUE'), true);
  assert.equal(parseBool('FALSE'), false);
  assert.equal(parseBool(''), false);
  assert.equal(parseBool(undefined), false);
});

test('parseOrders reads the sample sheet', () => {
  assert.deepEqual(missing, []);
  assert.equal(orders.length, 171);
  assert.equal(orders[0].row, 2);
  assert.equal(orders[0].orderId, '408-9563881-9476348');
  assert.equal(orders[0].sku, 'KP4001992');
  assert.deepEqual(orders[0].pickupDate, new Date(2026, 10, 2));
  assert.equal(orders.filter((o) => o.sku === 'VSS-DLPK-01').length, 3);
  assert.equal(orders.filter((o) => o.shipped).length, 1);
});

test('parseOrders reports missing required columns', () => {
  const r = parseOrders(['SKU', 'Order ID'], [['X', '1']]);
  assert.deepEqual(r.missing, ['Order Date', 'Pickup Date', 'Shipped']);
});

test('todoBucket: today, overdue, future, shipped overdue and sticky', () => {
  const today = new Date(2026, 10, 2, 15, 0);
  assert.equal(todoBucket(order({ pickupDate: new Date(2026, 10, 2) }), today), 'today');
  assert.equal(todoBucket(order({ pickupDate: new Date(2026, 10, 2), shipped: true }), today), 'today');
  assert.equal(todoBucket(order({ pickupDate: new Date(2026, 10, 1) }), today), 'overdue');
  assert.equal(todoBucket(order({ pickupDate: new Date(2026, 10, 3) }), today), null);
  const doneLate = order({ pickupDate: new Date(2026, 10, 1), shipped: true });
  assert.equal(todoBucket(doneLate, today), null);
  assert.equal(todoBucket(doneLate, today, new Set([orderKey(doneLate)])), 'overdue');
  assert.equal(todoBucket(order({}), today), null);
});

test('groupBySku sorts groups by size and keeps lines in stable order-time order', () => {
  const g = groupBySku([
    order({ row: 2, sku: 'B', shipped: true, orderDate: new Date(2026, 0, 1, 9) }),
    order({ row: 3, sku: 'A' }),
    order({ row: 4, sku: 'B', orderDate: new Date(2026, 0, 1, 11) }),
    order({ row: 5, sku: 'B', qty: 3, orderDate: new Date(2026, 0, 1, 10) }),
  ]);
  assert.deepEqual(g.map((x) => x.sku), ['B', 'A']);
  assert.equal(g[0].units, 5);
  assert.equal(g[0].done, 1);
  assert.deepEqual(g[0].orders.map((o) => o.row), [2, 5, 4]);
});

test('computeStats on the sample sheet', () => {
  const today = new Date(2026, 10, 2, 12);
  const s = computeStats(orders, today, null);
  assert.equal(s.total, 171);
  assert.equal(s.shipped + s.unshipped, 171);
  assert.equal(s.bySku[0].sku, 'KP4001992');
  assert.equal(s.bySku.reduce((n, b) => n + b.orders, 0), 171);
  assert.equal(s.perDay.length, 14);
  assert.equal(s.perDay.at(-1)!.day, dayKey(today));
  assert.equal(s.byHour.reduce((a, b) => a + b, 0), 171);
  const dueToday = orders.filter((o) => o.pickupDate && dayKey(o.pickupDate) === dayKey(today)).length;
  assert.equal(s.dueToday, dueToday);
  assert.ok(s.attention.some((o) => /no slots/i.test(o.status)));
  assert.ok(s.upcoming.every((u) => u.day > dayKey(today)));
});

test('filterOrders by status, SKU, date range and search', () => {
  const nick = (s: string) => (s === 'KP4001992' ? 'Kuber Potli' : s);
  const base = { ship: 'all', dateField: 'pickupDate', from: '', to: '', sku: '', query: '' } as const;
  assert.equal(filterOrders(orders, { ...base, ship: 'shipped' }, nick).length, 1);
  assert.equal(filterOrders(orders, { ...base, sku: 'VSS-DLPK-01' }, nick).length, 3);
  assert.equal(filterOrders(orders, { ...base, query: 'kuber potli' }, nick).length, 168);
  const day = filterOrders(orders, { ...base, from: '2026-11-02', to: '2026-11-02' }, nick);
  assert.ok(day.length > 0);
  assert.ok(day.every((o) => dayKey(o.pickupDate!) === '2026-11-02'));
});

test('toCsv escapes commas and quotes', () => {
  const csv = toCsv([order({ productName: 'A, "B"', orderDate: new Date(2026, 0, 5, 9, 7) })], (s) => s);
  assert.match(csv, /"A, ""B"""/);
  assert.match(csv, /2026-01-05 09:07/);
});
