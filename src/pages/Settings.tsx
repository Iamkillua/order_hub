import { useState } from 'react';
import { api } from '../lib/api';
import { useHub } from '../lib/hub';
import { ago } from '../lib/format';
import { Topbar } from '../components/Shell';
import { Avatar } from '../components/ui';
import { Gear, LogOut, Sheet } from '../components/Icons';
import { ExternalLink, SheetPicker } from './Setup';

const INTERVALS = [
  { v: 30, label: 'Every 30 seconds' },
  { v: 60, label: 'Every minute' },
  { v: 120, label: 'Every 2 minutes' },
  { v: 300, label: 'Every 5 minutes' },
  { v: 900, label: 'Every 15 minutes' },
];

export function SettingsPage() {
  const { state, setState, fetchedAt, orders, toast, refresh } = useHub();
  const [changing, setChanging] = useState(false);
  const sheet = state.sheet!;
  const account = state.account;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit`;

  const signOut = async () => {
    try {
      setState(await api.signOut());
    } catch (e) {
      toast({ kind: 'error', text: (e as Error).message });
    }
  };

  const setInterval = async (refreshSeconds: number) => {
    try {
      setState(await api.saveSettings({ refreshSeconds }));
      toast({ kind: 'success', text: 'Auto-refresh updated.' });
    } catch (e) {
      toast({ kind: 'error', text: (e as Error).message });
    }
  };

  const resetClient = async () => {
    await api.signOut().catch(() => {});
    setState({ ...state, hasCredentials: false, signedIn: false });
  };

  return (
    <>
      <Topbar route="settings" icon={<Gear size={22} />} />
      <div className="content">
        <div className="settings-page">
          <h2>Settings</h2>
          <p>Order Hub reads your orders sheet and writes only the Shipped column, plus a hidden tab for SKU nicknames.</p>

          <h4>Google account</h4>
          <div className="account-card">
            <div className="banner" />
            <div className="body">
              <Avatar label={account?.name || '?'} color="#5865f2" size={72} picture={account?.picture} />
              <div className="who">
                <b>{account?.name || 'Signed in'}</b>
                <span>{account?.email}</span>
              </div>
              <button className="btn red sm" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
            </div>
          </div>

          <h4>Orders sheet</h4>
          <div className="section">
            {changing ? (
              <SheetPicker
                submitLabel="Switch sheet"
                onCancel={() => setChanging(false)}
                onSelected={(s) => { setChanging(false); setState(s); }}
              />
            ) : (
              <div className="row">
                <Sheet size={28} style={{ color: '#23a55a', flex: 'none' }} />
                <div className="grow">
                  <b>{sheet.title}</b>
                  <p>Tab “{sheet.tab}” · {orders.length.toLocaleString('en-IN')} orders · {fetchedAt ? `synced ${ago(fetchedAt)}` : 'not synced yet'}</p>
                  <p><ExternalLink href={sheetUrl}>Open in Google Sheets</ExternalLink></p>
                </div>
                <button className="btn outline sm" onClick={() => setChanging(true)}>Change sheet</button>
              </div>
            )}
          </div>

          <h4>Sync</h4>
          <div className="section">
            <div className="row">
              <div className="grow">
                <b>Auto-refresh</b>
                <p>Pulls new orders and changes made by others while the window is open. Also refreshes when you switch back to the app.</p>
              </div>
              <select className="select sm" style={{ width: 200 }} value={state.refreshSeconds} onChange={(e) => void setInterval(Number(e.target.value))} aria-label="Auto-refresh interval">
                {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
                {!INTERVALS.some((i) => i.v === state.refreshSeconds) && <option value={state.refreshSeconds}>Every {state.refreshSeconds}s</option>}
              </select>
            </div>
          </div>
          <div className="section">
            <div className="row">
              <div className="grow">
                <b>Refresh now</b>
                <p>Shortcut: Ctrl+R or F5.</p>
              </div>
              <button className="btn grey sm" onClick={() => void refresh()}>Refresh</button>
            </div>
          </div>

          <h4>OAuth client</h4>
          <div className="section">
            <div className="row">
              <div className="grow">
                <b>Client ID</b>
                <p className="mono selectable" style={{ fontSize: 13 }}>{state.clientId || '—'}</p>
              </div>
              <button className="btn outline sm" onClick={() => void resetClient()}>Replace</button>
            </div>
          </div>

          <h4>About</h4>
          <div className="section">
            <div className="row">
              <div className="grow">
                <b>Order Hub {state.version}</b>
                <p>Shortcuts: Ctrl+1 todo · Ctrl+2 orders · Ctrl+3 overview · Ctrl+4 nicknames</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
