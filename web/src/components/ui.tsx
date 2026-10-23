import { createContext, forwardRef, ReactNode, useCallback, useContext, useEffect, useId, useRef, useState, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, X, Inbox } from 'lucide-react';
import clsx from 'clsx';
import { label } from '@/lib/format';

/* ---------- Buttons ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }, ref) => (
  <button ref={ref} type="button" disabled={disabled || loading} aria-busy={loading || undefined} className={clsx(`btn-${variant}`, size === 'sm' && 'btn-sm', className)} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>
));

/* ---------- Form controls ---------- */
export function Field({ label: l, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: (a: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode; htmlFor?: string }) {
  const id = useId(); const fid = htmlFor ?? id; const d = error ? `${fid}-e` : hint ? `${fid}-h` : undefined;
  return (
    <div>
      <label htmlFor={fid} className="label">{l}</label>
      {children({ id: fid, 'aria-invalid': error ? true : undefined, 'aria-describedby': d })}
      {error ? <p id={`${fid}-e`} role="alert" className="mt-1 text-xs text-danger-text">{error}</p> : hint ? <p id={`${fid}-h`} className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) => <input ref={r} className={clsx('input', className)} {...p} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, r) => <select ref={r} className={clsx('input pr-8', className)} {...p} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 4, ...p }, r) => <textarea ref={r} rows={rows} className={clsx('input', className)} {...p} />);

/* ---------- Layout bits ---------- */
export const Card = ({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={clsx('card', className)} {...p}>{children}</div>;
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
const TONES: Record<string, string> = {
  green: 'bg-emerald-soft text-emerald-hover', amber: 'bg-warn-bg text-warn-text', red: 'bg-danger-bg text-danger-text', blue: 'bg-blue-50 text-info', gray: 'bg-mutedbg text-muted',
};
const STATUS_TONE: Record<string, string> = {
  paid: 'green', active: 'green', confirmed: 'green', approved: 'green', completed: 'green', resolved: 'green', published: 'green', available: 'green', succeeded: 'green',
  pending: 'amber', submitted: 'amber', under_review: 'amber', information_required: 'amber', alternative_proposed: 'amber', partially_paid: 'amber', issued: 'blue', waiting_for_parts: 'amber', reopened: 'amber', initiated: 'blue', draft: 'gray', unpublished: 'gray', in_progress: 'blue', assigned: 'blue', acknowledged: 'blue',
  overdue: 'red', rejected: 'red', cancelled: 'gray', no_show: 'red', failed: 'red', terminated: 'red', emergency: 'red', high: 'amber', void: 'gray', expired: 'gray', withdrawn: 'gray', closed: 'gray', archived: 'gray', occupied: 'blue', maintenance: 'amber', renewed: 'gray', normal: 'gray', low: 'gray', suspended: 'red', invited: 'amber', deactivated: 'gray',
};
export const Badge = ({ status, tone, children }: { status?: string; tone?: keyof typeof TONES; children?: ReactNode }) => (
  <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone ?? STATUS_TONE[status ?? ''] ?? 'gray'])}>{children ?? label(status)}</span>
);
export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('skeleton', className)} aria-hidden />;
export const Spinner = ({ label: l = 'Loading' }: { label?: string }) => <div role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{l}…</div>;
export function Empty({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    <div className="mb-3 rounded-full bg-mutedbg p-3 text-muted">{icon ?? <Inbox className="h-5 w-5" aria-hidden />}</div>
    <p className="font-medium text-navy">{title}</p>{hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}{action && <div className="mt-4">{action}</div>}
  </div>;
}
export function ErrorState({ error, onRetry }: { error: any; onRetry?: () => void }) {
  const denied = error?.status === 403 || error?.status === 404;
  return <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
    <AlertTriangle className="mb-2 h-6 w-6 text-danger-text" aria-hidden />
    <p className="font-medium text-navy">{error?.status === 403 ? "You don't have permission to view this" : error?.status === 404 ? 'Not found' : "Couldn't load this"}</p>
    <p className="mt-1 text-sm text-muted">{error?.message}</p>
    {onRetry && !denied && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}
  </div>;
}
export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const s = { info: 'bg-blue-50 text-info', warn: 'bg-warn-bg text-warn-text', danger: 'bg-danger-bg text-danger-text', success: 'bg-emerald-soft text-emerald-hover' }[tone];
  const I = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return <div role={tone === 'danger' ? 'alert' : 'note'} className={clsx('flex gap-3 rounded-ctl p-3 text-sm', s)}><I className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div>{title && <p className="font-semibold">{title}</p>}{children}</div></div>;
}
export const MockBanner = () => <Notice tone="warn" title="Demo payment — no real money transferred">All payments in this app are simulated for demonstration.</Notice>;

export function Pagination({ meta, onPage }: { meta?: { page: number; pages: number; total: number }; onPage: (p: number) => void }) {
  if (!meta || meta.pages <= 1) return meta ? <p className="px-4 py-3 text-xs text-muted">{meta.total} result{meta.total === 1 ? '' : 's'}</p> : null;
  return <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
    <span className="text-muted num">Page {meta.page} of {meta.pages} · {meta.total} results</span>
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden />Prev</Button>
      <Button variant="secondary" size="sm" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} aria-label="Next page">Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
    </div>
  </nav>;
}

/* ---------- Modal (focus trap, Esc, scroll lock) ---------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const tid = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return; const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tid} className={clsx('fade-in card max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-b-card', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
      <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3"><h2 id={tid} className="text-base font-semibold">{title}</h2>
        <button data-close aria-label="Close dialog" onClick={onClose} className="rounded-ctl p-1.5 text-muted hover:bg-mutedbg"><X className="h-4 w-4" aria-hidden /></button></div>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}
export function Confirm({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', danger, busy }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean }) {
  return <Modal open={open} onClose={onClose} title={title}><div className="space-y-4 text-sm">{children}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button></div></div></Modal>;
}

/* ---------- Toasts ---------- */
type T = { id: number; kind: 'success' | 'error'; msg: string };
const ToastCtx = createContext<{ success: (m: string) => void; error: (m: string) => void }>(null as any);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((kind: T['kind'], msg: string) => { const id = Date.now() + Math.random(); setItems((s) => [...s, { id, kind, msg }]); setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5000); }, []);
  return <ToastCtx.Provider value={{ success: (m) => push('success', m), error: (m) => push('error', m) }}>
    {children}
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => <div key={t.id} className={clsx('fade-in pointer-events-auto flex max-w-md items-center gap-2 rounded-ctl px-4 py-2.5 text-sm shadow-lg', t.kind === 'success' ? 'bg-navy text-white' : 'bg-danger text-white')}>
        {t.kind === 'success' ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}{t.msg}</div>)}
    </div></ToastCtx.Provider>;
}

/* ---------- Generic paged table ---------- */
export type Col<T = any> = { header: string; cell: (r: T) => ReactNode; className?: string };
export function DataTable<T = any>({ rows, cols, loading, error, onRetry, empty, meta, onPage, onRow }: { rows?: T[]; cols: Col<T>[]; loading?: boolean; error?: any; onRetry?: () => void; empty?: ReactNode; meta?: any; onPage?: (p: number) => void; onRow?: (r: T) => void }) {
  if (error) return <Card><ErrorState error={error} onRetry={onRetry} /></Card>;
  return <Card className="overflow-hidden">
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-mutedbg text-xs uppercase tracking-wide text-muted"><tr>{cols.map((c) => <th key={c.header} scope="col" className={clsx('px-4 py-2.5 font-medium', c.className)}>{c.header}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">
        {loading ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{cols.map((c) => <td key={c.header} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>)
          : rows?.map((r: any, i) => <tr key={r._id ?? r.id ?? i} className={clsx('hover:bg-bg/60', onRow && 'cursor-pointer')} onClick={() => onRow?.(r)}>{cols.map((c) => <td key={c.header} className={clsx('px-4 py-3 align-middle', c.className)}>{c.cell(r)}</td>)}</tr>)}
      </tbody></table></div>
    {!loading && rows?.length === 0 && (empty ?? <Empty title="Nothing here yet" />)}
    {onPage && <Pagination meta={meta} onPage={onPage} />}
  </Card>;
}
export const Stat = ({ label: l, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'warn' }) => (
  <Card className="p-4"><p className="text-xs font-medium text-muted">{l}</p><p className={clsx('num mt-1 text-2xl font-semibold', tone === 'danger' ? 'text-danger-text' : tone === 'warn' ? 'text-warn-text' : 'text-navy')}>{value}</p>{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</Card>
);
export const Tabs = ({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) => (
  <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">{tabs.map((t) =>
    <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.id ? 'border-emerald text-emerald-text' : 'border-transparent text-muted hover:text-navy')}>{t.label}</button>)}</div>
);
