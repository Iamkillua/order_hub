import type { AppState, Bridge, ShipItem } from './api';
import type { Nickname } from './orders';
import { parseCellDate } from './orders';
import sample from '../../dev/sample-orders.csv?raw';

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

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Dev-only stand-in for the Electron bridge, backed by dev/sample-orders.csv. Use ?mock=setup to preview onboarding. */
export function createMockBridge(): Bridge {
  const params = new URLSearchParams(location.search);
  const setup = params.get('mock') === 'setup';
  const table = parseCsv(sample);
  const headers = table[0];
  const shippedCol = headers.indexOf('Shipped');
  const rows: unknown[][] = table.slice(1).filter((r) => r.length > 1);
  // Shift the fixture so its 02-Nov-2026 pickups land on today (keeps overdue/today/upcoming realistic). ?mock=raw disables.
  if (params.get('mock') !== 'raw') {
    const anchor = new Date(2026, 10, 2);
    const now = new Date();
    const offset = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - anchor.getTime()) / 86400000);
    for (const name of ['Order Date', 'Pickup Date']) {
      const c = headers.indexOf(name);
      for (const r of rows) {
        const d = parseCellDate(r[c]);
        if (!d) continue;
        d.setDate(d.getDate() + offset);
        r[c] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }
  }
  let nicknames: Nickname[] = [{ sku: 'KP4001992', nickname: 'Kuber Potli', color: '#f0b232' }];
  const state: AppState = {
    hasCredentials: !setup,
    clientId: setup ? '' : '1234567890-demo.apps.googleusercontent.com',
    signedIn: !setup,
    account: setup ? null : { email: 'dispatch@vss.example', name: 'VSS Dispatch', picture: '' },
    sheet: setup ? null : { spreadsheetId: 'demo', title: 'VSS Order Tracker Working', tab: 'Orders' },
    refreshSeconds: 60,
    version: '1.0.0-dev',
  };
  return {
    getState: () => ok({ ...state }),
    saveCredentials: async ({ clientId }) => { state.hasCredentials = true; state.clientId = clientId; return ok({ ...state }); },
    signIn: async () => {
      await wait(1200);
      state.signedIn = true;
      state.account = { email: 'dispatch@vss.example', name: 'VSS Dispatch', picture: '' };
      return ok({ ...state });
    },
    cancelSignIn: () => ok(undefined),
    signOut: async () => { state.signedIn = false; state.account = null; return ok({ ...state }); },
    inspectSheet: async () => { await wait(400); return ok({ spreadsheetId: 'demo', title: 'VSS Order Tracker Working', tabs: [{ title: 'Orders', rowCount: rows.length + 1 }, { title: 'Returns', rowCount: 40 }] }); },
    previewTab: async () => ok({ headers, missing: [], rowCount: rows.length }),
    selectSheet: async (s) => { state.sheet = s; return ok({ ...state }); },
    clearSheet: async () => { state.sheet = null; return ok({ ...state }); },
    saveSettings: async ({ refreshSeconds }) => { state.refreshSeconds = refreshSeconds; return ok({ ...state }); },
    loadOrders: async () => { await wait(250); return ok({ headers, rows: rows.map((r) => [...r]), fetchedAt: Date.now() }); },
    setShipped: async (items: ShipItem[]) => {
      await wait(350);
      for (const it of items) rows[it.row - 2][shippedCol] = it.shipped ? 'TRUE' : 'FALSE';
      return ok(items.map((i) => ({ ...i, ok: true })));
    },
    loadNicknames: () => ok(nicknames),
    saveNicknames: async (list) => { await wait(400); nicknames = list; return ok(list); },
    openExternal: async (url) => { window.open(url, '_blank'); return ok(undefined); },
    onFocus: () => () => {},
  };
}
