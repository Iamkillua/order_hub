import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, type AppState } from '../lib/api';
import { useHub } from '../lib/hub';
import { plural } from '../lib/format';
import { SKU_COLORS } from '../lib/orders';
import { useSkuDraft } from './Nicknames';
import { Avatar, Titlebar } from '../components/ui';
import { Alert, Check, Chevron, External, Google, X } from '../components/Icons';

const CONSOLE = 'https://console.cloud.google.com/apis/credentials';
const SHEETS_API = 'https://console.cloud.google.com/apis/library/sheets.googleapis.com';

function Frame({ step, children }: { step: number; children: ReactNode }) {
  useEffect(() => {
    window.orderHub?.setTitlebar?.('setup');
    return () => window.orderHub?.setTitlebar?.('app');
  }, []);
  return (
    <div className="setup">
      <Titlebar />
      <div className="setup-stage">
        <div className="auth" key={step}>
          <div className="steps" aria-label={`Step ${step} of 4`}>
            {[1, 2, 3, 4].map((i) => <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />)}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const ext = (url: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  void api.openExternal(url);
};

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="form-error" role="alert"><Alert size={16} style={{ flex: 'none', marginTop: 2 }} />{text}</p>;
}

export function Setup({ state, onState }: { state: AppState; onState: (s: AppState) => void }) {
  if (!state.hasCredentials) return <CredentialsStep onState={onState} />;
  if (!state.signedIn) return <SignInStep state={state} onState={onState} />;
  return (
    <Frame step={3}>
      <h1>Choose your orders sheet</h1>
      <p className="sub">Signed in as {state.account?.email}. Paste the link to the Google Sheet that holds your orders.</p>
      <SheetPicker onSelected={onState} />
    </Frame>
  );
}

export function CredentialsStep({ onState, onCancel }: { onState: (s: AppState) => void; onCancel?: () => void }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onState(await api.saveCredentials({ clientId: clientId.trim(), clientSecret: secret.trim() }));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Frame step={1}>
      <h1>Welcome to Order Hub</h1>
      <p className="sub">Connect a Google OAuth client so Order Hub can read and tick off orders in your sheet.</p>
      <form onSubmit={submit}>
        <details>
          <summary><Chevron size={16} />How do I get these?</summary>
          <ol>
            <li>Open the <a className="link" href={SHEETS_API} onClick={ext(SHEETS_API)}>Google Sheets API</a> page and click <b>Enable</b>.</li>
            <li>In <a className="link" href={CONSOLE} onClick={ext(CONSOLE)}>Credentials</a>, configure the OAuth consent screen (External, testing) and add your Google account as a test user.</li>
            <li>Create credentials → <b>OAuth client ID</b> → application type <code>Desktop app</code>.</li>
            <li>Copy the client ID and client secret here. They are stored encrypted on this PC.</li>
          </ol>
        </details>
        <div className="field">
          <label className="label" htmlFor="cid">Client ID<span className="req">*</span></label>
          <input id="cid" className="input mono" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234-abc.apps.googleusercontent.com" autoFocus spellCheck={false} />
        </div>
        <div className="field">
          <label className="label" htmlFor="csec">Client secret<span className="req">*</span></label>
          <input id="csec" className="input mono" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" spellCheck={false} />
        </div>
        <ErrorLine text={err} />
        <button className="btn wide" disabled={busy || !clientId.trim() || !secret.trim()}>{busy ? 'Saving…' : 'Continue'}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </form>
    </Frame>
  );
}

function SignInStep({ state, onState }: { state: AppState; onState: (s: AppState) => void }) {
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const expired = !!state.account;

  const signIn = async () => {
    setWaiting(true);
    setErr(null);
    try {
      onState(await api.signIn());
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code !== 'SIGNIN_CANCELLED') setErr(ae.message);
      setWaiting(false);
    }
  };

  const resetClient = async () => {
    await api.cancelSignIn().catch(() => {});
    onState({ ...state, hasCredentials: false, signedIn: false });
  };

  return (
    <Frame step={2}>
      <h1>{expired ? 'Sign in again' : 'Sign in with Google'}</h1>
      <p className="sub">{expired ? 'Your Google session expired. Sign in to keep syncing orders.' : 'Your browser will open to approve access to Google Sheets.'}</p>
      <div className="stack">
        {waiting ? (
          <div className="waiting" role="status">
            <span className="dots3"><i /><i /><i /></span>
            <span style={{ flex: 1 }}>Waiting for you to finish in the browser…</span>
            <button className="btn xs grey" onClick={() => void api.cancelSignIn()}><X size={14} /> Cancel</button>
          </div>
        ) : (
          <button className="google-btn" onClick={() => void signIn()}><Google size={20} /> Continue with Google</button>
        )}
        <ErrorLine text={err} />
        <p className="hint">
          Order Hub asks only for your profile and access to Google Sheets. Using a different OAuth client?{' '}
          <a className="link" onClick={() => void resetClient()}>Change client ID</a>
        </p>
      </div>
    </Frame>
  );
}

interface Inspected { spreadsheetId: string; title: string; tabs: { title: string; rowCount: number }[] }
interface Preview { headers: string[]; missing: string[]; rowCount: number }

export function SheetPicker({ onSelected, submitLabel = 'Use this sheet', onCancel }: { onSelected: (s: AppState) => void; submitLabel?: string; onCancel?: () => void }) {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<Inspected | null>(null);
  const [tab, setTab] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'' | 'inspect' | 'preview' | 'select'>('');
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  const inspect = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return;
    setBusy('inspect');
    setErr(null);
    setInfo(null);
    setPreview(null);
    try {
      const r = await api.inspectSheet(url.trim());
      setInfo(r);
      const guess = r.tabs.find((t) => /order/i.test(t.title)) ?? r.tabs[0];
      setTab(guess?.title ?? '');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (!info || !tab) return;
    const id = ++seq.current;
    setBusy('preview');
    setPreview(null);
    setErr(null);
    api.previewTab({ spreadsheetId: info.spreadsheetId, tab })
      .then((p) => { if (id === seq.current) setPreview(p); })
      .catch((e: Error) => { if (id === seq.current) setErr(e.message); })
      .finally(() => { if (id === seq.current) setBusy(''); });
  }, [info, tab]);

  const select = async () => {
    if (!info) return;
    setBusy('select');
    try {
      onSelected(await api.selectSheet({ spreadsheetId: info.spreadsheetId, title: info.title, tab }));
    } catch (e) {
      setErr((e as Error).message);
      setBusy('');
    }
  };

  const required = ['SKU', 'Order ID', 'Order Date', 'Pickup Date', 'Shipped'];

  return (
    <div className="stack">
      <form className="field" onSubmit={inspect}>
        <label className="label" htmlFor="sheet-url">Sheet link</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="sheet-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" autoFocus spellCheck={false} />
          <button className="btn" disabled={!url.trim() || busy === 'inspect'}>{busy === 'inspect' ? 'Opening…' : 'Open'}</button>
        </div>
      </form>
      {info && (
        <div className="field">
          <label className="label" htmlFor="sheet-tab">Tab in “{info.title}”</label>
          <select id="sheet-tab" className="select" value={tab} onChange={(e) => setTab(e.target.value)}>
            {info.tabs.map((t) => <option key={t.title} value={t.title}>{t.title}</option>)}
          </select>
        </div>
      )}
      {info && busy === 'preview' && <div className="waiting"><span className="dots3"><i /><i /><i /></span>Checking columns…</div>}
      {preview && (
        <ul className="checklist" aria-label="Required columns">
          {required.map((c) => {
            const ok = !preview.missing.some((m) => m.toLowerCase() === c.toLowerCase());
            return <li key={c} className={ok ? 'ok' : 'bad'}>{ok ? <Check size={16} /> : <X size={16} />}{c}{!ok && ' — column not found'}</li>;
          })}
          <li style={{ color: 'var(--text-muted)', marginTop: 4 }}>{plural(preview.rowCount, 'row')} found</li>
        </ul>
      )}
      <ErrorLine text={err} />
      {info && (
        <div className="foot">
          {onCancel ? <button className="btn ghost" onClick={onCancel}>Cancel</button> : <span />}
          <button className="btn" onClick={() => void select()} disabled={!preview || preview.missing.length > 0 || busy === 'select'}>
            {busy === 'select' ? 'Connecting…' : submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function NicknameStep({ onDone }: { onDone: () => void }) {
  const { loaded, saveNicknames, toast } = useHub();
  const { skus, draft, dirty, update, toList } = useSkuDraft();
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    if (dirty) {
      setBusy(true);
      try {
        await saveNicknames(toList());
      } catch (e) {
        toast({ kind: 'error', text: `Couldn’t save nicknames: ${(e as Error).message}` });
        setBusy(false);
        return;
      }
    }
    onDone();
  };

  return (
    <Frame step={4}>
      <h1>Name your SKUs</h1>
      <p className="sub">Optional. Short names make the todo list faster to scan. You can change them later.</p>
      <div className="stack">
        {!loaded ? (
          <div className="waiting"><span className="dots3"><i /><i /><i /></span>Loading orders…</div>
        ) : skus.length === 0 ? (
          <p className="hint">No SKUs found yet. You can add nicknames once orders arrive.</p>
        ) : (
          <div className="mini-sku thin-scroll">
            {skus.map(({ sku, count, product }, i) => (
              <div className="r" key={sku}>
                <Avatar label={draft[sku]?.nickname || sku} color={draft[sku]?.color ?? SKU_COLORS[i % SKU_COLORS.length]} size={32} />
                <div style={{ minWidth: 0 }}><b>{sku}</b><span title={product}>{plural(count, 'order')} · {product}</span></div>
                <input className="input sm" placeholder="Nickname" value={draft[sku]?.nickname ?? ''} onChange={(e) => update(sku, { nickname: e.target.value })} aria-label={`Nickname for ${sku}`} maxLength={40} />
              </div>
            ))}
          </div>
        )}
        <div className="foot">
          <button className="btn ghost" onClick={onDone} disabled={busy}>Skip</button>
          <button className="btn green" onClick={() => void finish()} disabled={busy || !loaded}>{busy ? 'Saving…' : 'Open todo'}</button>
        </div>
      </div>
    </Frame>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="link" href={href} onClick={ext(href)}>{children} <External size={12} /></a>;
}
