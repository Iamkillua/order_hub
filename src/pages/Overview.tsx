import { useMemo, useState } from 'react';
import { useHub } from '../lib/hub';
import { computeStats, fromDayKey, dayKey } from '../lib/orders';
import { dayMonth, keyLabel, plural, relativeDay } from '../lib/format';
import { RefreshButton, Topbar, type Route } from '../components/Shell';
import { Chart } from '../components/Icons';

const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: 'all', label: 'All time', days: null },
  { id: '30', label: '30 days', days: 30 },
  { id: '7', label: '7 days', days: 7 },
];

const n = (v: number) => v.toLocaleString('en-IN');

export function OverviewPage({ go }: { go: (r: Route) => void }) {
  const { orders, today, nicknameOf, colorOf } = useHub();
  const [range, setRange] = useState('all');
  const days = RANGES.find((r) => r.id === range)!.days;
  const s = useMemo(() => computeStats(orders, today, days), [orders, today, days]);

  const todayKey = dayKey(today);
  const maxDay = Math.max(1, ...s.perDay.map((d) => d.shipped + d.unshipped));
  const maxHour = Math.max(1, ...s.byHour);
  const maxSku = Math.max(1, ...s.bySku.map((b) => b.orders));
  const shipRate = s.total ? Math.round((s.shipped / s.total) * 100) : 0;
  const leftToday = s.dueToday - s.shippedToday;
  const peakHour = s.byHour.indexOf(Math.max(...s.byHour));

  return (
    <>
      <Topbar route="overview" icon={<Chart size={22} />}>
        <div className="tabs" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.id} className="tab-btn" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
        <RefreshButton />
      </Topbar>
      <div className="content">
        <div className="ov">
          <section className="panel span-12 today-strip" aria-label="Today">
            <div className="lead">
              <h3>Today’s dispatch</h3>
              <p>{dayMonth(today)} · pickups due today and backlog</p>
              <button className="btn sm" onClick={() => go('todo')}>{leftToday + s.overdue > 0 ? `Ship ${leftToday + s.overdue} now` : 'Open todo'}</button>
            </div>
            <div>
              <div className="fig">{n(s.dueToday)}</div>
              <div className="fig-label">Due for pickup today</div>
              <div className="fig-sub">{leftToday > 0 ? `${leftToday} still to pack` : s.dueToday ? 'All packed' : 'None scheduled'}</div>
            </div>
            <div>
              <div className="fig green">{n(s.shippedToday)}</div>
              <div className="fig-label">Shipped today</div>
              <div className="fig-sub">{s.dueToday ? `${Math.round((s.shippedToday / s.dueToday) * 100)}% of today’s pickups` : '—'}</div>
            </div>
            <div>
              <div className={`fig${s.overdue ? ' red' : ''}`}>{n(s.overdue)}</div>
              <div className="fig-label">Overdue</div>
              <div className="fig-sub">{s.overdue ? 'Pickup date passed, not shipped' : 'No backlog'}</div>
            </div>
            <div>
              <div className="fig">{n(s.dueTomorrow)}</div>
              <div className="fig-label">Due tomorrow</div>
              <div className="fig-sub">{n(s.orderedToday)} new {s.orderedToday === 1 ? 'order' : 'orders'} today</div>
            </div>
          </section>

          <section className="panel span-8">
            <h3>Orders per day <small>last 14 days, by order date</small>
              <span className="legend"><span><i style={{ background: '#23a55a' }} />Shipped</span><span><i style={{ background: '#5865f2' }} />Unshipped</span></span>
            </h3>
            <div className="cols" role="img" aria-label="Orders per day for the last 14 days">
              {s.perDay.map((d) => {
                const total = d.shipped + d.unshipped;
                const h = (total / maxDay) * 100;
                return (
                  <div key={d.day} className={`c${d.day === todayKey ? ' today' : ''}`} title={`${keyLabel(d.day)}: ${total} orders, ${d.shipped} shipped`}>
                    {total > 0 && <span className="v" style={{ bottom: `calc(${h}% + 4px)` }}>{total}</span>}
                    <div className="stack" style={{ height: `${h}%` }}>
                      <i style={{ flex: d.shipped, background: '#23a55a' }} />
                      <i style={{ flex: d.unshipped, background: '#5865f2' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="axis">
              {s.perDay.map((d) => <span key={d.day} className={d.day === todayKey ? 'today' : ''}>{d.day === todayKey ? 'Today' : String(fromDayKey(d.day).getDate())}</span>)}
            </div>
          </section>

          <section className="panel span-4">
            <h3>Upcoming pickups <small>unshipped</small></h3>
            {s.upcoming.length === 0 ? <p className="hint">Nothing scheduled after today.</p> : (
              <div className="list">
                {s.upcoming.map((u) => (
                  <div className="item" key={u.day}>
                    <div className="day">{relativeDay(fromDayKey(u.day), today)}<small>{keyLabel(u.day)}</small></div>
                    <div className="dots">
                      {Object.entries(u.bySku).map(([sku, q]) => (
                        <span key={sku} className="chip" title={sku}><i style={{ background: colorOf(sku) }} /><span>{nicknameOf(sku)} ×{q}</span></span>
                      ))}
                    </div>
                    <div className="n">{plural(u.count, 'order')}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel span-7">
            <h3>Distribution by SKU <small>{plural(s.bySku.length, 'SKU')}</small></h3>
            <div className="hbars">
              {s.bySku.map((b) => {
                const name = nicknameOf(b.sku);
                const c = colorOf(b.sku);
                const w = (b.orders / maxSku) * 100;
                return (
                  <div className="hbar" key={b.sku}>
                    <div className="top">
                      <span className="name" style={{ color: c }}>{name}</span>
                      {name !== b.sku && <span className="sku">{b.sku}</span>}
                      <span className="n">{n(b.orders)} orders · {s.total ? Math.round((b.orders / s.total) * 100) : 0}%</span>
                    </div>
                    <div className="track" style={{ width: `${Math.max(w, 2)}%` }}>
                      <i style={{ flex: b.shipped, background: c }} />
                      <i style={{ flex: b.orders - b.shipped, background: c, opacity: 0.35 }} />
                    </div>
                    <div className="sub">{n(b.units)} units · {n(b.shipped)} shipped · {n(b.orders - b.shipped)} pending</div>
                  </div>
                );
              })}
              {!s.bySku.length && <p className="hint">No orders in this range.</p>}
            </div>
          </section>

          <section className="panel span-5">
            <h3>When orders come in <small>{s.total ? `peak ${String(peakHour).padStart(2, '0')}:00` : 'by hour'}</small></h3>
            <div className="hours" role="img" aria-label="Orders by hour of day">
              {s.byHour.map((v, h) => <i key={h} style={{ height: `${(v / maxHour) * 100}%`, opacity: v ? 0.9 : 0.25 }} title={`${String(h).padStart(2, '0')}:00 — ${v} orders`} />)}
            </div>
            <div className="hours-axis">
              {s.byHour.map((_, h) => <span key={h}>{h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
            </div>
          </section>

          <section className="panel span-8">
            <h3>Totals <small>{RANGES.find((r) => r.id === range)!.label.toLowerCase()}</small></h3>
            <div className="facts">
              <div className="fact"><div className="fig">{n(s.total)}</div><div className="fig-label">Orders</div></div>
              <div className="fact"><div className="fig">{n(s.units)}</div><div className="fig-label">Units</div></div>
              <div className="fact"><div className="fig">{shipRate}%</div><div className="fig-label">Shipped</div><div className="fig-sub">{n(s.shipped)} of {n(s.total)}</div></div>
              <div className="fact"><div className="fig">{s.avgPerDay ? s.avgPerDay.toFixed(1) : '—'}</div><div className="fig-label">Orders per active day</div></div>
              <div className="fact"><div className="fig">{s.busiest ? n(s.busiest.count) : '—'}</div><div className="fig-label">Busiest day</div><div className="fig-sub">{s.busiest ? keyLabel(s.busiest.day) : ''}</div></div>
              <div className="fact"><div className="fig">{n(s.multiUnit)}</div><div className="fig-label">Multi-unit orders</div></div>
            </div>
          </section>

          <section className="panel span-4">
            <h3>Needs attention <small>{s.attention.length ? plural(s.attention.length, 'order') : 'status column'}</small></h3>
            {s.attention.length === 0 ? <p className="hint">Every order has a normal status.</p> : (
              <div className="list">
                {s.attention.slice(0, 6).map((o) => (
                  <div className="item" key={`${o.orderId}-${o.row}`}>
                    <span className="mono selectable" style={{ fontSize: 13 }}>{o.orderId}</span>
                    <span className="status-pill warn" style={{ marginLeft: 'auto', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.status}>{o.status}</span>
                  </div>
                ))}
                {s.attention.length > 6 && <button className="link" style={{ marginTop: 10, textAlign: 'left' }} onClick={() => go('orders')}>View all in orders</button>}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
