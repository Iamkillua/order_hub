import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useHub } from '../lib/hub';
import { todoBucket } from '../lib/orders';
import { ago } from '../lib/format';
import { Avatar, Titlebar } from './ui';
import { Chart, ChevronDown, Gear, Hash, Logo, Plus, Refresh, Tag } from './Icons';

export type Route = 'todo' | 'orders' | 'overview' | 'nicknames' | 'settings';

export const ROUTES: { id: Route; label: string; topic: string }[] = [
  { id: 'todo', label: 'todo', topic: 'Unshipped orders due for pickup today, plus anything overdue.' },
  { id: 'orders', label: 'orders', topic: 'Every order in the sheet. Filter by shipping status, date and SKU.' },
  { id: 'overview', label: 'overview', topic: 'Volume, SKU mix and dispatch health at a glance.' },
  { id: 'nicknames', label: 'sku-nicknames', topic: 'Give SKUs short names. Saved to a hidden tab in your sheet.' },
  { id: 'settings', label: 'settings', topic: 'Account, sheet and sync.' },
];

export function Topbar({ route, children, icon }: { route: Route; children?: ReactNode; icon?: ReactNode }) {
  const r = ROUTES.find((x) => x.id === route)!;
  return (
    <header className="topbar">
      <span className="hash">{icon ?? <Hash size={22} />}</span>
      <h1>{r.label}</h1>
      <span className="divider" />
      <span className="topic">{r.topic}</span>
      <div className="tools">{children}</div>
    </header>
  );
}

export function RefreshButton() {
  const { refresh, syncing } = useHub();
  return (
    <button className="icon-btn" aria-label="Refresh from sheet" data-tip="Refresh (Ctrl+R)" data-tip-pos="top" onClick={() => void refresh()} disabled={syncing}>
      <Refresh size={20} className={syncing ? 'spin' : ''} />
    </button>
  );
}

export function Shell({ route, go, children }: { route: Route; go: (r: Route) => void; children: ReactNode }) {
  const { state, orders, today, syncing, error, fetchedAt, hasNickname } = useHub();
  const sheet = state.sheet!;
  const account = state.account;

  const counts = useMemo(() => {
    let remaining = 0;
    let overdue = 0;
    const skus = new Set<string>();
    for (const o of orders) {
      skus.add(o.sku);
      const b = todoBucket(o, today);
      if (b && !o.shipped) {
        remaining++;
        if (b === 'overdue') overdue++;
      }
    }
    const unnamed = [...skus].filter((s) => s && !hasNickname(s)).length;
    return { remaining, overdue, unnamed, total: orders.length };
  }, [orders, today, hasNickname]);

  const statusText = error ? 'Offline — retrying' : syncing ? 'Syncing…' : fetchedAt ? `Synced ${ago(fetchedAt)}` : 'Connecting…';
  const sheetInitials = sheet.title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'OH';

  const channel = (id: Route, icon: ReactNode, badge?: ReactNode) => {
    const r = ROUTES.find((x) => x.id === id)!;
    return (
      <button className={`channel${route === id ? ' active' : ''}`} onClick={() => go(id)} aria-current={route === id ? 'page' : undefined}>
        {icon}
        <span className="name">{r.label}</span>
        {badge}
      </button>
    );
  };

  return (
    <div className="app">
      <Titlebar>
        <span className="sync">{statusText}</span>
      </Titlebar>
      <div className="layout">
        <nav className="rail" aria-label="Spreadsheets">
          <div className="rail-item">
            <button className="rail-btn home" data-tip="Order Hub" aria-label="Order Hub — go to todo" onClick={() => go('todo')}>
              <Logo size={26} />
            </button>
          </div>
          <div className="rail-sep" />
          <div className="rail-item active">
            <span className="rail-pill" />
            <button className="rail-btn" data-tip={`${sheet.title} · ${sheet.tab}`} onClick={() => go('todo')}>
              {sheetInitials}
            </button>
            {counts.remaining > 0 && <span className="rail-badge">{counts.remaining > 99 ? '99+' : counts.remaining}</span>}
          </div>
          <div className="rail-item">
            <span className="rail-pill" />
            <button className="rail-btn add" data-tip="Switch orders sheet" aria-label="Switch orders sheet" onClick={() => go('settings')}>
              <Plus size={24} />
            </button>
          </div>
        </nav>

        <aside className="side">
          <div className="side-head" onClick={() => go('settings')} role="button" tabIndex={0} title="Sheet settings">
            <span className="title">{sheet.title}</span>
            <span className="tab">{sheet.tab}</span>
            <ChevronDown size={18} />
          </div>
          <div className="channels thin-scroll">
            <div className="category">Dispatch</div>
            {channel('todo', <Hash size={20} />, counts.remaining > 0 ? (
              <span className="mention" title={`${counts.remaining} to ship${counts.overdue ? `, ${counts.overdue} overdue` : ''}`}>{counts.remaining}</span>
            ) : undefined)}
            {channel('orders', <Hash size={20} />, <span className="count-muted">{counts.total}</span>)}
            <div className="category">Insights</div>
            {channel('overview', <Chart size={20} />)}
            <div className="category">Setup</div>
            {channel('nicknames', <Tag size={20} />, counts.unnamed > 0 ? <span className="count-muted" title="SKUs without a nickname">{counts.unnamed} new</span> : undefined)}
            {channel('settings', <Gear size={20} />)}
          </div>
          <div className="userpanel">
            <div className="who" title={account?.email}>
              <Avatar label={account?.name || '?'} color="#5865f2" size={32} picture={account?.picture} status={error ? 'offline' : syncing ? 'syncing' : 'online'} />
              <div className="meta">
                <b>{account?.name || 'Signed in'}</b>
                <span>{statusText}</span>
              </div>
            </div>
            <RefreshButton />
            <button className="icon-btn" aria-label="Settings" data-tip="Settings" data-tip-pos="top" onClick={() => go('settings')}>
              <Gear size={20} />
            </button>
          </div>
        </aside>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
