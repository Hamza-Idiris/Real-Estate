export const money = (minor: number | undefined | null, currency = 'USD') => {
  if (minor === undefined || minor === null) return '—';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
};
export const toMinor = (v: string | number) => Math.round(Number(v) * 100);
export const fromMinor = (m: number) => (m / 100).toString();
export const fmtDate = (iso?: string | Date, tz = 'UTC') => iso ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: tz }).format(new Date(iso)) : '—';
export const fmtDateTime = (iso?: string | Date, tz = 'UTC') => iso ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso)) : '—';
export const label = (s?: string) => (s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const cap = label;
export const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return `${Math.floor(s / 86400)} d ago`;
};
export const sumCur = (o?: Record<string, number>) => Object.entries(o ?? {});
