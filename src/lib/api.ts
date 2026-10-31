import type { Nickname } from './orders';

export interface Account {
  email: string;
  name: string;
  picture: string;
}

export interface SheetRef {
  spreadsheetId: string;
  title: string;
  tab: string;
}

export interface AppState {
  hasCredentials: boolean;
  clientId: string;
  signedIn: boolean;
  account: Account | null;
  sheet: SheetRef | null;
  refreshSeconds: number;
  version: string;
}

export interface ShipItem {
  row: number;
  orderId: string;
  sku: string;
  shipped: boolean;
}

export type ShipResult = ShipItem & { ok: boolean; error?: string };

type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export interface Bridge {
  getState(): Promise<Result<AppState>>;
  saveCredentials(c: { clientId: string; clientSecret: string }): Promise<Result<AppState>>;
  signIn(): Promise<Result<AppState>>;
  cancelSignIn(): Promise<Result<void>>;
  signOut(): Promise<Result<AppState>>;
  inspectSheet(input: string): Promise<Result<{ spreadsheetId: string; title: string; tabs: { title: string; rowCount: number }[] }>>;
  previewTab(a: { spreadsheetId: string; tab: string }): Promise<Result<{ headers: string[]; missing: string[]; rowCount: number }>>;
  selectSheet(s: SheetRef): Promise<Result<AppState>>;
  clearSheet(): Promise<Result<AppState>>;
  saveSettings(s: { refreshSeconds: number }): Promise<Result<AppState>>;
  loadOrders(): Promise<Result<{ headers: unknown[]; rows: unknown[][]; fetchedAt: number }>>;
  setShipped(items: ShipItem[]): Promise<Result<ShipResult[]>>;
  loadNicknames(): Promise<Result<Nickname[]>>;
  saveNicknames(list: Nickname[]): Promise<Result<Nickname[]>>;
  openExternal(url: string): Promise<Result<void>>;
  onFocus(fn: () => void): () => void;
  setTitlebar?(theme: 'setup' | 'app'): void;
}

declare global {
  interface Window {
    orderHub?: Bridge;
  }
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

let bridge: Bridge | null = null;

export async function initBridge(): Promise<Bridge> {
  if (bridge) return bridge;
  if (window.orderHub) bridge = window.orderHub;
  else if (import.meta.env.DEV) bridge = (await import('./mock')).createMockBridge();
  else throw new Error('Order Hub must run inside its desktop app.');
  return bridge;
}

type Unwrap<T> = T extends Promise<Result<infer U>> ? U : never;

export const api = new Proxy({} as { [K in keyof Bridge]: Bridge[K] extends (...a: infer A) => Promise<Result<unknown>> ? (...a: A) => Promise<Unwrap<ReturnType<Bridge[K]>>> : Bridge[K] }, {
  get(_t, prop: keyof Bridge) {
    if (prop === 'onFocus') return (fn: () => void) => bridge!.onFocus(fn);
    return async (...args: unknown[]) => {
      const res = await (bridge![prop] as (...a: unknown[]) => Promise<Result<unknown>>)(...args);
      if (!res.ok) throw new ApiError(res.code, res.message);
      return res.data;
    };
  },
});
