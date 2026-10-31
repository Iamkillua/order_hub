import type { ReactNode } from 'react';
import { initials } from '../lib/orders';
import { useHub } from '../lib/hub';
import { Alert, Check, Logo, X } from './Icons';

export function Avatar({ label, color, size = 40, picture, status }: {
  label: string; color: string; size?: number; picture?: string; status?: 'online' | 'offline' | 'syncing';
}) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: picture ? 'transparent' : color, fontSize: size * 0.4 }}>
      {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" /> : initials(label)}
      {status && <i className={`status ${status === 'online' ? '' : status}`} />}
    </div>
  );
}

export function Checkbox({ checked, pending, onChange, label }: { checked: boolean; pending?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check${pending ? ' pending' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <Check size={14} />
    </button>
  );
}

export function SkuChip({ sku }: { sku: string }) {
  const { nicknameOf, colorOf } = useHub();
  return (
    <span className="chip" title={sku}>
      <i style={{ background: colorOf(sku) }} />
      <span>{nicknameOf(sku)}</span>
    </span>
  );
}

export function Titlebar({ children }: { children?: ReactNode }) {
  return (
    <div className="titlebar">
      <Logo size={14} />
      <span>Order Hub</span>
      {children}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useHub();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'error' ? <Alert className="lead" size={18} /> : t.kind === 'success' ? <Check className="lead" size={18} /> : null}
          <span className="t">{t.text}</span>
          {t.action && (
            <button className="btn xs grey" onClick={() => { t.action!.run(); dismissToast(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Line-art parcel stack used for empty states. */
export function ParcelArt() {
  return (
    <svg width="168" height="120" viewBox="0 0 168 120" fill="none" aria-hidden>
      <ellipse cx="84" cy="110" rx="70" ry="6" fill="#232428" />
      <g stroke="#4e5058" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M30 62 58 50l28 12v34L58 108 30 96z" fill="#2b2d31" />
        <path d="M30 62l28 12 28-12M58 74v34" />
        <path d="M82 62l28-12 28 12v34l-28 12-28-12z" fill="#2b2d31" />
        <path d="M82 62l28 12 28-12M110 74v34" />
        <path d="M56 30 84 18l28 12v34L84 76 56 64z" fill="#313338" />
        <path d="M56 30l28 12 28-12M84 42v34" />
      </g>
      <circle cx="128" cy="26" r="16" fill="#23a55a" />
      <path d="m120.5 26.5 5 5 10-10" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
