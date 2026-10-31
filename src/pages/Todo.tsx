import { useMemo, useState } from 'react';
import { useHub } from '../lib/hub';
import { groupBySku, orderKey, todoBucket, dayKey, startOfDay, type Order, type SkuGroup } from '../lib/orders';
import { dayMonth, daysLate, longDay, plural, shortDay, time } from '../lib/format';
import { RefreshButton, Topbar, type Route } from '../components/Shell';
import { Avatar, Checkbox, ParcelArt } from '../components/ui';
import { Alert, Check, Copy, Todo as TodoIcon, Undo } from '../components/Icons';

export function TodoPage({ go }: { go: (r: Route) => void }) {
  const { orders, today, sticky, loaded, error, refresh } = useHub();
  const [hideDone, setHideDone] = useState(false);

  const { overdue, todays, stats, next } = useMemo(() => {
    const overdue: Order[] = [];
    const todays: Order[] = [];
    let dueToday = 0;
    let doneToday = 0;
    for (const o of orders) {
      const b = todoBucket(o, today, sticky);
      if (b === 'overdue') overdue.push(o);
      if (b === 'today') {
        todays.push(o);
        dueToday++;
        if (o.shipped) doneToday++;
      }
    }
    const t = startOfDay(today).getTime();
    const future = orders.filter((o) => !o.shipped && o.pickupDate && startOfDay(o.pickupDate).getTime() > t);
    let next: { date: Date; count: number } | null = null;
    if (future.length) {
      const first = future.reduce((a, b) => (a.pickupDate! < b.pickupDate! ? a : b)).pickupDate!;
      const k = dayKey(first);
      next = { date: first, count: future.filter((o) => dayKey(o.pickupDate!) === k).length };
    }
    const overdueLeft = overdue.filter((o) => !o.shipped).length;
    return { overdue, todays, stats: { dueToday, doneToday, overdueLeft, remaining: overdueLeft + (dueToday - doneToday) }, next };
  }, [orders, today, sticky]);

  const visible = (list: Order[]) => (hideDone ? list.filter((o) => !o.shipped) : list);
  const overdueGroups = groupBySku(visible(overdue));
  const todayGroups = groupBySku(visible(todays));
  const pct = stats.dueToday ? stats.doneToday / stats.dueToday : 0;
  const nothing = !overdueGroups.length && !todayGroups.length;

  return (
    <>
      <Topbar route="todo">
        <div className="tabs">
          <button className="tab-btn" aria-pressed={hideDone} onClick={() => setHideDone((v) => !v)}>
            Hide shipped
          </button>
        </div>
        <RefreshButton />
      </Topbar>
      {error && (
        <div className="banner-error" role="alert">
          <Alert size={18} />
          <span className="grow">{error.message}</span>
          <button className="btn xs grey" onClick={() => void refresh()}>Try again</button>
        </div>
      )}
      <div className="content">
        <div className="stream">
          <div className="stream-head">
            <div className="big"><TodoIcon size={34} /></div>
            <div className="grow">
              <h2>{longDay(today)}</h2>
              <p>
                {!loaded ? 'Loading orders from your sheet…' : stats.remaining === 0
                  ? 'Nothing left to ship for today.'
                  : <>{plural(stats.remaining, 'order')} left to ship{stats.overdueLeft > 0 && <>, <b style={{ color: '#ff7a7d' }}>{stats.overdueLeft} overdue</b></>}.</>}
              </p>
            </div>
            {stats.dueToday > 0 && (
              <div className="progress" aria-label={`${stats.doneToday} of ${stats.dueToday} of today’s pickups shipped`}>
                <div className="row"><span>Today’s pickups shipped</span><b>{stats.doneToday}<span style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 600 }}> / {stats.dueToday}</span></b></div>
                <div className="bar"><i style={{ transform: `scaleX(${pct})` }} /></div>
              </div>
            )}
          </div>

          {loaded && nothing && (
            <div className="empty">
              <ParcelArt />
              <h3>All caught up</h3>
              <p>
                {hideDone && (overdue.length || todays.length)
                  ? 'Everything due today is shipped.'
                  : 'No orders are due for pickup today.'}{' '}
                {next ? <>Next pickup is <b style={{ color: 'var(--text)' }}>{shortDay(next.date)}</b> with {plural(next.count, 'order')}.</> : 'No upcoming pickups in the sheet.'}
              </p>
              <button className="btn" onClick={() => go('orders')}>Browse all orders</button>
            </div>
          )}

          {overdueGroups.length > 0 && (
            <>
              <div className="divider-label red"><span>Overdue · {stats.overdueLeft}</span></div>
              {overdueGroups.map((g) => <Group key={`o-${g.sku}`} group={g} overdue />)}
            </>
          )}
          {todayGroups.length > 0 && (
            <>
              <div className="divider-label"><span>Pickup today · {dayMonth(today)}</span></div>
              {todayGroups.map((g) => <Group key={`t-${g.sku}`} group={g} />)}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Group({ group, overdue }: { group: SkuGroup; overdue?: boolean }) {
  const { nicknameOf, colorOf, hasNickname, setShipped, pending, toast } = useHub();
  const name = nicknameOf(group.sku);
  const color = colorOf(group.sku);
  const open = group.orders.filter((o) => !o.shipped);
  const units = open.reduce((n, o) => n + o.qty, 0);

  const copyIds = async () => {
    await navigator.clipboard.writeText(open.map((o) => o.orderId).join('\n'));
    toast({ kind: 'info', text: `Copied ${plural(open.length, 'order ID')}.` });
  };

  return (
    <article className="msg" aria-label={`${name}: ${open.length} to ship`}>
      <Avatar label={name} color={color} size={40} />
      <div className="msg-head">
        <span className="author" style={{ color }}>{name}</span>
        {hasNickname(group.sku) && <span className="sku">{group.sku}</span>}
        <span className="ts">
          {open.length ? `${plural(open.length, 'order')} · ${plural(units, 'unit')} to pack` : 'All shipped'}
          {group.done > 0 && open.length > 0 && ` · ${group.done} done`}
        </span>
      </div>
      <div className="msg-actions">
        {open.length > 0 && (
          <button onClick={() => void setShipped(open, true)}><Check size={16} /> Mark all {open.length} shipped</button>
        )}
        {open.length === 0 && group.done > 0 && (
          <button onClick={() => void setShipped(group.orders, false)}><Undo size={16} /> Unmark all</button>
        )}
        {open.length > 0 && <button onClick={() => void copyIds()}><Copy size={16} /> Copy IDs</button>}
      </div>
      <div className="lines">
        {group.orders.map((o) => <Line key={orderKey(o)} order={o} overdue={overdue} pending={pending.has(orderKey(o))} onToggle={() => void setShipped([o], !o.shipped)} />)}
      </div>
    </article>
  );
}

function Line({ order, overdue, pending, onToggle }: { order: Order; overdue?: boolean; pending: boolean; onToggle: () => void }) {
  const { today, toast } = useHub();
  const late = overdue && order.pickupDate ? daysLate(order.pickupDate, today) : 0;
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(order.orderId);
    toast({ kind: 'info', text: `Copied ${order.orderId}` });
  };
  return (
    <div className={`line${order.shipped ? ' done' : ''}`} onClick={onToggle} title={order.productName}>
      <Checkbox checked={order.shipped} pending={pending} onChange={onToggle} label={`${order.orderId} shipped`} />
      <span className="oid selectable">{order.orderId}</span>
      {order.qty > 1 && <span className="qty" title={`${order.qty} units`}>×{order.qty}</span>}
      <span className="when">
        {late > 0
          ? <span style={{ color: '#ff7a7d' }}>{late === 1 ? '1 day late' : `${late} days late`}</span>
          : order.orderDate ? `ordered ${dayMonth(order.orderDate)}, ${time(order.orderDate)}` : ''}
      </span>
      <button className="copy" aria-label={`Copy ${order.orderId}`} onClick={copy}><Copy size={14} /></button>
    </div>
  );
}
