import { addDays, dayKey, fromDayKey, startOfDay } from './orders';

const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', o);
const fDay = dtf({ weekday: 'short', day: 'numeric', month: 'short' });
const fLong = dtf({ weekday: 'long', day: 'numeric', month: 'long' });
const fDate = dtf({ day: '2-digit', month: 'short', year: 'numeric' });
const fTime = dtf({ hour: '2-digit', minute: '2-digit', hour12: false });
const fShort = dtf({ day: 'numeric', month: 'short' });

export const longDay = (d: Date) => fLong.format(d);
export const shortDay = (d: Date) => fDay.format(d);
export const dayMonth = (d: Date) => fShort.format(d);
export const time = (d: Date) => fTime.format(d);
export const dateOnly = (d: Date | null) => (d ? fDate.format(d) : '—');
export const dateTime = (d: Date | null) => (d ? `${fDate.format(d)}, ${fTime.format(d)}` : '—');

export function relativeDay(d: Date, today: Date): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return `${-diff} days ago`;
  return `In ${diff} days`;
}

export function daysLate(d: Date, today: Date): number {
  return Math.round((startOfDay(today).getTime() - startOfDay(d).getTime()) / 86400000);
}

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

export function presetRange(preset: string, today: Date): { from: string; to: string } {
  const t = startOfDay(today);
  switch (preset) {
    case 'today': return { from: dayKey(t), to: dayKey(t) };
    case 'yesterday': return { from: dayKey(addDays(t, -1)), to: dayKey(addDays(t, -1)) };
    case 'tomorrow': return { from: dayKey(addDays(t, 1)), to: dayKey(addDays(t, 1)) };
    case '7d': return { from: dayKey(addDays(t, -6)), to: dayKey(t) };
    case '30d': return { from: dayKey(addDays(t, -29)), to: dayKey(t) };
    case 'month': return { from: dayKey(new Date(t.getFullYear(), t.getMonth(), 1)), to: dayKey(t) };
    default: return { from: '', to: '' };
  }
}

export const keyLabel = (key: string) => shortDay(fromDayKey(key));
