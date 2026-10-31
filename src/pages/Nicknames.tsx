import { useEffect, useMemo, useRef, useState } from 'react';
import { useHub } from '../lib/hub';
import { colorFor, SKU_COLORS, type Nickname } from '../lib/orders';
import { plural } from '../lib/format';
import { Topbar } from '../components/Shell';
import { Avatar } from '../components/ui';
import { Tag } from '../components/Icons';

type Draft = Record<string, { nickname: string; color: string }>;

export function useSkuDraft() {
  const { orders, nicknames } = useHub();
  const skus = useMemo(() => {
    const m = new Map<string, { count: number; product: string }>();
    for (const o of orders) {
      const e = m.get(o.sku) ?? { count: 0, product: o.productName };
      e.count++;
      m.set(o.sku, e);
    }
    for (const n of nicknames) if (!m.has(n.sku)) m.set(n.sku, { count: 0, product: '' });
    return [...m.entries()].filter(([s]) => s).sort((a, b) => b[1].count - a[1].count).map(([sku, v]) => ({ sku, ...v }));
  }, [orders, nicknames]);

  const saved = useMemo(() => {
    const d: Draft = {};
    for (const { sku } of skus) {
      const n = nicknames.find((x) => x.sku === sku);
      d[sku] = { nickname: n?.nickname ?? '', color: colorFor(sku, n?.color) };
    }
    return d;
  }, [skus, nicknames]);

  const [draft, setDraft] = useState<Draft>(saved);
  const prevSaved = useRef(saved);
  // Orders refresh every minute; keep the user's unsaved edits and take everything else from the sheet.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    const prev = prevSaved.current;
    prevSaved.current = saved;
    setDraft((d) => {
      const next: Draft = { ...saved };
      for (const [k, v] of Object.entries(d)) {
        const p = prev[k];
        if (k in saved && p && (v.nickname !== p.nickname || v.color !== p.color)) next[k] = v;
      }
      return next;
    });
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = skus.some(({ sku }) => (draft[sku]?.nickname.trim() ?? '') !== saved[sku].nickname || draft[sku]?.color !== saved[sku].color);
  const toList = (): Nickname[] =>
    skus.filter(({ sku }) => draft[sku]?.nickname.trim()).map(({ sku }) => ({ sku, nickname: draft[sku].nickname.trim(), color: draft[sku].color }));
  const update = (sku: string, patch: Partial<{ nickname: string; color: string }>) =>
    setDraft((d) => ({ ...d, [sku]: { ...(d[sku] ?? saved[sku]), ...patch } }));

  return { skus, draft, saved, dirty, update, reset: () => setDraft(saved), toList };
}

export function NicknamesPage() {
  const { saveNicknames, dirtyGuard, toast } = useHub();
  const { skus, draft, dirty, update, reset, toList } = useSkuDraft();
  const [saving, setSaving] = useState(false);
  const [shake, setShake] = useState(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    dirtyGuard.current = () => {
      if (!dirtyRef.current) return false;
      setShake((n) => n + 1);
      return true;
    };
    return () => { dirtyGuard.current = null; };
  }, [dirtyGuard]);

  const save = async () => {
    setSaving(true);
    try {
      await saveNicknames(toList());
      toast({ kind: 'success', text: 'Nicknames saved to your sheet.' });
    } catch (e) {
      toast({ kind: 'error', text: `Couldn’t save nicknames: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  const unnamed = skus.filter(({ sku }) => !draft[sku]?.nickname.trim()).length;

  return (
    <>
      <Topbar route="nicknames" icon={<Tag size={22} />} />
      <div className="content">
        <div className="settings-page">
          <h2>SKU nicknames</h2>
          <p>
            Nicknames replace raw SKUs across todo, orders and overview. They are stored in a hidden
            <span className="mono" style={{ fontSize: 13 }}> OrderHub_SKU_Nicknames </span>
            tab in your spreadsheet, so every PC signed in to this sheet sees the same names.
          </p>
          <h4>{plural(skus.length, 'SKU')}{unnamed ? ` · ${unnamed} without a nickname` : ''}</h4>
          {skus.length === 0 ? <p className="hint">No SKUs found in the sheet yet.</p> : (
            <div className="roles">
              {skus.map(({ sku, count, product }) => {
                const d = draft[sku];
                return (
                  <div className="role" key={sku}>
                    <Avatar label={d.nickname || sku} color={d.color} size={40} />
                    <div className="info">
                      <b>{sku}<span className="n">{plural(count, 'order')}</span></b>
                      <p title={product}>{product || 'Not in the current orders'}</p>
                      <div className="swatches" role="group" aria-label={`Colour for ${sku}`}>
                        {SKU_COLORS.map((c) => (
                          <button key={c} className="swatch" style={{ background: c }} aria-pressed={d.color === c} aria-label={c} onClick={() => update(sku, { color: c })} />
                        ))}
                      </div>
                    </div>
                    <input
                      className="input"
                      placeholder="Add a nickname"
                      maxLength={40}
                      value={d.nickname}
                      onChange={(e) => update(sku, { nickname: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void save(); }}
                      aria-label={`Nickname for ${sku}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {dirty && (
        <div key={shake} className={`notice-bar${shake ? ' shake' : ''}`} role="status">
          <span className="msg-text">Careful — you have unsaved changes!</span>
          <button className="btn ghost sm" onClick={() => { reset(); setShake(0); }} disabled={saving}>Reset</button>
          <button className="btn green sm" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}
    </>
  );
}
