import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type AppState } from './api';
import { colorFor, orderKey, parseOrders, type Nickname, type Order } from './orders';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
  action?: { label: string; run: () => void };
}

interface Override {
  value: boolean;
  settledAt: number | null;
}

interface Hub {
  state: AppState;
  setState: (s: AppState) => void;
  orders: Order[];
  missingColumns: string[];
  loaded: boolean;
  syncing: boolean;
  error: ApiError | null;
  fetchedAt: number | null;
  today: Date;
  refresh: () => Promise<void>;
  pending: Set<string>;
  sticky: Set<string>;
  setShipped: (orders: Order[], shipped: boolean, opts?: { silent?: boolean }) => Promise<void>;
  nicknames: Nickname[];
  saveNicknames: (list: Nickname[]) => Promise<void>;
  nicknameOf: (sku: string) => string;
  hasNickname: (sku: string) => boolean;
  colorOf: (sku: string) => string;
  toast: (t: Omit<Toast, 'id'>) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  dirtyGuard: { current: (() => boolean) | null };
}

const Ctx = createContext<Hub | null>(null);

export function useHub(): Hub {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHub outside provider');
  return v;
}

const AUTH_CODES = new Set(['AUTH_EXPIRED', 'AUTH_REQUIRED', 'BAD_CLIENT']);

export function HubProvider({ initial, onStateChange, children }: { initial: AppState; onStateChange?: (s: AppState) => void; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const onStateRef = useRef(onStateChange);
  onStateRef.current = onStateChange;
  useEffect(() => {
    if (state !== initial) onStateRef.current?.(state);
  }, [state, initial]);
  const [raw, setRaw] = useState<{ orders: Order[]; missing: string[] }>({ orders: [], missing: [] });
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [sticky, setSticky] = useState<Set<string>>(new Set());
  const [nicknames, setNicknames] = useState<Nickname[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [today, setToday] = useState(() => new Date());
  const inflight = useRef<Promise<void> | null>(null);
  const toastId = useRef(0);
  const dirtyGuard = useRef<(() => boolean) | null>(null);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId.current;
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => dismissToast(id), t.kind === 'error' ? 8000 : 5000);
  }, [dismissToast]);

  const handleError = useCallback((err: unknown) => {
    const e = err instanceof ApiError ? err : new ApiError('ERROR', String((err as Error)?.message || err));
    if (AUTH_CODES.has(e.code)) {
      setState((s) => ({ ...s, signedIn: false }));
    }
    return e;
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const startedAt = Date.now();
    setSyncing(true);
    const run = (async () => {
      try {
        const [data, nicks] = await Promise.all([api.loadOrders(), api.loadNicknames()]);
        setRaw(parseOrders(data.headers, data.rows));
        setNicknames(nicks);
        setFetchedAt(data.fetchedAt);
        setError(null);
        setOverrides((prev) => {
          const next = new Map(prev);
          for (const [k, o] of prev) if (o.settledAt != null && o.settledAt < startedAt) next.delete(k);
          return next;
        });
        setLoaded(true);
      } catch (err) {
        setError(handleError(err));
        setLoaded(true);
      } finally {
        setSyncing(false);
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [handleError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, Math.max(15, state.refreshSeconds) * 1000);
    return () => clearInterval(id);
  }, [refresh, state.refreshSeconds]);

  useEffect(() => api.onFocus(() => void refresh()), [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setToday((t) => (t.toDateString() === now.toDateString() ? t : now));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const orders = useMemo(() => {
    if (!overrides.size) return raw.orders;
    return raw.orders.map((o) => {
      const ov = overrides.get(orderKey(o));
      return ov && ov.value !== o.shipped ? { ...o, shipped: ov.value } : o;
    });
  }, [raw.orders, overrides]);

  const setShipped = useCallback(async (list: Order[], shipped: boolean, opts?: { silent?: boolean }) => {
    const targets = list.filter((o) => !pending.has(orderKey(o)));
    if (!targets.length) return;
    const keys = targets.map(orderKey);
    setOverrides((prev) => {
      const next = new Map(prev);
      keys.forEach((k) => next.set(k, { value: shipped, settledAt: null }));
      return next;
    });
    setPending((prev) => new Set([...prev, ...keys]));
    setSticky((prev) => new Set([...prev, ...keys]));
    try {
      const results = await api.setShipped(targets.map((o) => ({ row: o.row, orderId: o.orderId, sku: o.sku, shipped })));
      const failed = results.filter((r) => !r.ok);
      const now = Date.now();
      setOverrides((prev) => {
        const next = new Map(prev);
        keys.forEach((k, i) => {
          if (results[i] && !results[i].ok) next.delete(k);
          else next.set(k, { value: shipped, settledAt: now });
        });
        return next;
      });
      if (failed.length) {
        toast({ kind: 'error', text: `${failed.length} order${failed.length > 1 ? 's' : ''} couldn’t be found in the sheet. Refreshing.` });
        void refresh();
      } else if (!opts?.silent) {
        const label = targets.length === 1 ? targets[0].orderId : `${targets.length} orders`;
        toast({
          kind: 'success',
          text: shipped ? `${label} marked shipped in the sheet.` : `${label} moved back to unshipped.`,
          action: { label: 'Undo', run: () => void setShippedRef.current(targets.map((t) => ({ ...t, shipped })), !shipped, { silent: true }) },
        });
      }
    } catch (err) {
      const e = handleError(err);
      setOverrides((prev) => {
        const next = new Map(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
      toast({
        kind: 'error',
        text: `Couldn’t update the sheet: ${e.message}`,
        action: AUTH_CODES.has(e.code) ? undefined : { label: 'Retry', run: () => void setShippedRef.current(targets, shipped) },
      });
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
    }
  }, [pending, toast, refresh, handleError]);

  const setShippedRef = useRef(setShipped);
  setShippedRef.current = setShipped;

  const nickMap = useMemo(() => new Map(nicknames.map((n) => [n.sku, n])), [nicknames]);
  const nicknameOf = useCallback((sku: string) => nickMap.get(sku)?.nickname || sku || 'No SKU', [nickMap]);
  const hasNickname = useCallback((sku: string) => !!nickMap.get(sku)?.nickname, [nickMap]);
  const colorOf = useCallback((sku: string) => colorFor(sku, nickMap.get(sku)?.color), [nickMap]);

  const saveNicknames = useCallback(async (list: Nickname[]) => {
    try {
      const saved = await api.saveNicknames(list);
      setNicknames(saved);
      toast({ kind: 'success', text: 'Nicknames saved to the sheet.' });
    } catch (err) {
      const e = handleError(err);
      toast({ kind: 'error', text: `Couldn’t save nicknames: ${e.message}` });
      throw e;
    }
  }, [toast, handleError]);

  const value: Hub = {
    state, setState, orders, missingColumns: raw.missing, loaded, syncing, error, fetchedAt, today,
    refresh, pending, sticky, setShipped, nicknames, saveNicknames, nicknameOf, hasNickname, colorOf,
    toast, toasts, dismissToast, dirtyGuard,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
