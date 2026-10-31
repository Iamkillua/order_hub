import { useMemo, useState } from 'react';
import { useHub } from '../lib/hub';
import { filterOrders, orderKey, startOfDay, toCsv, type DateField, type Order, type OrderFilter, type ShipFilter } from '../lib/orders';
import { dateOnly, dateTime, plural, presetRange } from '../lib/format';
import { RefreshButton, Topbar } from '../components/Shell';
import { Checkbox, ParcelArt, SkuChip } from '../components/ui';
import { ArrowUpDown, Download, Search, X } from '../components/Icons';

type SortKey = 'orderId' | 'sku' | 'qty' | 'orderDate' | 'pickupDate' | 'shipped';

const PRESETS: { id: string; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
];

const EMPTY: OrderFilter = { ship: 'all', dateField: 'pickupDate', from: '', to: '', sku: '', query: '' };

export function OrdersPage() {
  const { orders, today, nicknameOf, setShipped, pending, toast } = useHub();
  const [f, setF] = useState<OrderFilter>(EMPTY);
  const [preset, setPreset] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'orderDate', dir: -1 });
  const set = (patch: Partial<OrderFilter>) => setF((p) => ({ ...p, ...patch }));

  const skus = useMemo(() => [...new Set(orders.map((o) => o.sku))].sort(), [orders]);
  const tabCounts = useMemo(() => {
    const base = filterOrders(orders, { ...f, ship: 'all' }, nicknameOf);
    const shipped = base.filter((o) => o.shipped).length;
    return { all: base.length, shipped, unshipped: base.length - shipped };
  }, [orders, f, nicknameOf]);

  const rows = useMemo(() => {
    const list = filterOrders(orders, f, nicknameOf);
    const val = (o: Order): number | string => {
      switch (sort.key) {
        case 'orderId': return o.orderId;
        case 'sku': return nicknameOf(o.sku).toLowerCase();
        case 'qty': return o.qty;
        case 'shipped': return Number(o.shipped);
        default: return o[sort.key]?.getTime() ?? 0;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.row - b.row;
    });
  }, [orders, f, sort, nicknameOf]);

  const units = rows.reduce((n, o) => n + o.qty, 0);
  const dirty = f.ship !== 'all' || f.from || f.to || f.sku || f.query;
  const t0 = startOfDay(today);

  const applyPreset = (id: string) => {
    setPreset(id);
    if (!id) set({ from: '', to: '' });
    else set(presetRange(id, today));
  };

  const exportCsv = () => {
    const blob = new Blob(['\ufeff' + toCsv(rows, nicknameOf)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast({ kind: 'success', text: `Exported ${plural(rows.length, 'order')} to CSV.` });
  };

  const th = (key: SortKey, label: string, cls?: string) => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'orderDate' || key === 'pickupDate' ? -1 : 1 }))}>
        {label}
        <ArrowUpDown size={12} style={{ opacity: sort.key === key ? 1 : 0.4 }} />
      </button>
    </th>
  );

  const status = (o: Order) => {
    if (o.status && !/^new$/i.test(o.status)) return <span className="status-pill warn" title={o.status}>{o.status.length > 28 ? o.status.slice(0, 26) + '…' : o.status}</span>;
    if (o.shipped) return <span className="status-pill ship">Shipped</span>;
    if (o.pickupDate && startOfDay(o.pickupDate) < t0) return <span className="status-pill late">Overdue</span>;
    return <span className="status-pill">{o.status || 'New'}</span>;
  };

  return (
    <>
      <Topbar route="orders">
        <label className="search">
          <input placeholder="Search orders" value={f.query} onChange={(e) => set({ query: e.target.value })} aria-label="Search orders" />
          {f.query ? <button aria-label="Clear search" onClick={() => set({ query: '' })}><X size={16} /></button> : <Search size={16} />}
        </label>
        <RefreshButton />
      </Topbar>
      <div className="filterbar">
        <div className="tabs" role="group" aria-label="Shipping status">
          {(['all', 'unshipped', 'shipped'] as ShipFilter[]).map((s) => (
            <button key={s} className="tab-btn" aria-pressed={f.ship === s} onClick={() => set({ ship: s })}>
              {s === 'all' ? 'All' : s === 'shipped' ? 'Shipped' : 'Unshipped'} <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{tabCounts[s]}</span>
            </button>
          ))}
        </div>
        <span className="sep" />
        <div className="grp">
          <select className="select sm" value={f.dateField} onChange={(e) => set({ dateField: e.target.value as DateField })} aria-label="Date field">
            <option value="pickupDate">Pickup date</option>
            <option value="orderDate">Order date</option>
          </select>
          <select className="select sm" value={preset} onChange={(e) => applyPreset(e.target.value)} aria-label="Date range preset">
            <option value="">Any time</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            {preset === 'custom' && <option value="custom">Custom</option>}
          </select>
          <input type="date" className="input sm" value={f.from} max={f.to || undefined} onChange={(e) => { setPreset('custom'); set({ from: e.target.value }); }} aria-label="From date" />
          <span>to</span>
          <input type="date" className="input sm" value={f.to} min={f.from || undefined} onChange={(e) => { setPreset('custom'); set({ to: e.target.value }); }} aria-label="To date" />
        </div>
        <span className="sep" />
        <div className="grp">
          <select className="select sm" value={f.sku} onChange={(e) => set({ sku: e.target.value })} aria-label="SKU">
            <option value="">All SKUs</option>
            {skus.map((s) => <option key={s} value={s}>{nicknameOf(s) === s ? s : `${nicknameOf(s)} · ${s}`}</option>)}
          </select>
        </div>
        {dirty && <button className="btn ghost xs" onClick={() => { setF(EMPTY); setPreset(''); }}>Clear filters</button>}
      </div>
      <div className="content">
        {rows.length === 0 ? (
          <div className="empty">
            <ParcelArt />
            <h3>No orders match</h3>
            <p>{orders.length ? 'Try a wider date range or clear the filters.' : 'The selected tab has no order rows yet.'}</p>
            {dirty && <button className="btn" onClick={() => { setF(EMPTY); setPreset(''); }}>Clear filters</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="orders">
              <thead>
                <tr>
                  {th('shipped', 'Shipped')}
                  {th('orderId', 'Order ID')}
                  {th('sku', 'SKU')}
                  {th('qty', 'Qty', 'num')}
                  {th('orderDate', 'Ordered')}
                  {th('pickupDate', 'Pickup')}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const k = orderKey(o);
                  return (
                    <tr key={k} className={o.shipped ? 'done' : ''}>
                      <td style={{ width: 72 }}>
                        <Checkbox checked={o.shipped} pending={pending.has(k)} label={`${o.orderId} shipped`} onChange={() => void setShipped([o], !o.shipped)} />
                      </td>
                      <td className="oid selectable">{o.orderId}</td>
                      <td><SkuChip sku={o.sku} /> {nicknameOf(o.sku) !== o.sku && <span className="muted mono" style={{ fontSize: 12, marginLeft: 6 }}>{o.sku}</span>}</td>
                      <td className="num">{o.qty}</td>
                      <td className="muted">{dateTime(o.orderDate)}</td>
                      <td>{o.pickupDate && !o.pickupDate.getHours() && !o.pickupDate.getMinutes() ? dateOnly(o.pickupDate) : dateTime(o.pickupDate)}</td>
                      <td>{status(o)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="table-foot">
        <span><b>{rows.length.toLocaleString('en-IN')}</b> of {orders.length.toLocaleString('en-IN')} orders</span>
        <span><b>{units.toLocaleString('en-IN')}</b> units</span>
        <span><b>{rows.filter((o) => o.shipped).length}</b> shipped</span>
        <span className="grow" style={{ flex: 1 }} />
        <button className="btn outline sm" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Export CSV</button>
      </div>
    </>
  );
}
