import { useState } from 'react';
import { CalendarDays, List } from 'lucide-react';
import { useAct, useApi, useCo } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Modal, PageHeader, Select, Textarea, Notice } from '@/components/ui';
import { fmtDateTime, label } from '@/lib/format';

const STATUSES = ['pending', 'confirmed', 'alternative_proposed', 'completed', 'cancelled', 'rejected', 'no_show'];
export function BookingsTable({ extra = {} }: { extra?: Record<string, any> }) {
  const co = useCo(); const { tz } = useAuth(); const { act, busy } = useAct();
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [view, setView] = useState<'list' | 'calendar'>('list'); const [sel, setSel] = useState<any>(null); const [mode, setMode] = useState(''); const [slot, setSlot] = useState(''); const [custom, setCustom] = useState(''); const [staff, setStaff] = useState(''); const [note, setNote] = useState('');
  const from = new Date().toISOString();
  const { data, isLoading, error, refetch } = useApi(co.path('/bookings'), view === 'calendar' ? { ...extra, view, from, to: new Date(Date.now() + 30 * 86_400_000).toISOString(), status: status || undefined } : { ...extra, page, limit: 15, status: status || undefined }, { keepPrevious: true });
  const team = useApi(mode === 'confirm' ? co.path('/staff/assignable') : null);
  const open = (b: any, m: string) => { setSel(b); setMode(m); setSlot(b.requestedSlots?.[0]?.start ?? ''); setCustom(''); setStaff(''); setNote(''); };
  const submit = async () => {
    const iso = custom ? new Date(custom).toISOString() : slot; let body: any = { action: mode, note: note || undefined };
    if (mode === 'confirm') body = { action: 'confirm', start: iso, ...(staff && { assignedStaffId: staff }) }; if (mode === 'propose') body = { action: 'propose', start: new Date(custom).toISOString(), note: note || undefined };
    if (await act(() => api.post(`${co.base}/bookings/${sel._id}/decision`, body), 'Viewing updated')) setSel(null);
  };
  const actions = (b: any) => <div className="flex flex-wrap justify-end gap-1.5">
    {['pending', 'alternative_proposed'].includes(b.status) && <Button size="sm" onClick={() => open(b, 'confirm')}>Confirm</Button>}{b.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => open(b, 'propose')}>Propose time</Button>}
    {['pending', 'alternative_proposed'].includes(b.status) && <Button size="sm" variant="ghost" onClick={() => open(b, 'reject')}>Reject</Button>}
    {b.status === 'confirmed' && <><Button size="sm" onClick={() => open(b, 'complete')}>Completed</Button><Button size="sm" variant="secondary" onClick={() => open(b, 'no_show')}>No-show</Button><Button size="sm" variant="ghost" onClick={() => open(b, 'cancel')}>Cancel</Button></>}</div>;
  const cal: Record<string, any[]> = {}; if (view === 'calendar') (data?.data ?? []).forEach((b: any) => { const d = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: tz }).format(new Date(b.confirmedStart)); (cal[d] ??= []).push(b); });
  return <><div className="mb-4 flex flex-wrap items-center gap-2"><Select aria-label="Filter by status" className="w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
    <div className="ml-auto flex rounded-ctl bg-mutedbg p-1" role="group" aria-label="View"><Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="h-4 w-4" aria-hidden />List</Button><Button size="sm" variant={view === 'calendar' ? 'secondary' : 'ghost'} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><CalendarDays className="h-4 w-4" aria-hidden />Calendar (30 days)</Button></div></div>
    {view === 'list' ? <DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} meta={data?.meta} onPage={setPage} empty={<Empty title="No viewing requests" hint="Requests from customers appear here." />}
      cols={[{ header: 'Property', cell: (b) => <span className="font-medium text-navy">{b.propertyId?.title}</span> }, { header: 'Contact', cell: (b) => <div className="text-sm">{b.contact?.name}<br /><span className="text-xs text-muted">{b.contact?.phone}</span></div> },
        { header: 'Requested / confirmed', cell: (b) => b.confirmedStart ? <span>{fmtDateTime(b.confirmedStart, tz)}</span> : <span className="text-muted">{(b.requestedSlots ?? []).map((s: any) => fmtDateTime(s.start, tz)).join(' · ')}</span> }, { header: 'Status', cell: (b) => <Badge status={b.status} /> }, { header: '', cell: actions }]} />
      : isLoading ? <p className="text-sm text-muted">Loading…</p> : !Object.keys(cal).length ? <Card><Empty title="No confirmed viewings in the next 30 days" /></Card> : <div className="space-y-4">{Object.entries(cal).map(([d, items]) => <Card key={d} className="p-4"><h3 className="mb-2 text-sm font-semibold">{d}</h3><ul className="divide-y divide-line">{items.map((b) => <li key={b._id} className="flex justify-between py-2 text-sm"><span><span className="num font-medium">{new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: tz }).format(new Date(b.confirmedStart))}</span> · {b.propertyId?.title}</span><span className="text-muted">{b.contact?.name}</span></li>)}</ul></Card>)}</div>}
    <Modal open={!!sel} onClose={() => setSel(null)} title={`${label(mode)} viewing`}>{sel && <div className="space-y-4 text-sm"><p className="text-muted">{sel.propertyId?.title} · {sel.contact?.name}</p>{sel.message && <Notice>{sel.message}</Notice>}
      {mode === 'confirm' && <>{sel.status === 'pending' && <fieldset><legend className="label">Choose a requested time</legend>{(sel.requestedSlots ?? []).map((s: any) => <label key={s.start} className="mb-1 flex items-center gap-2"><input type="radio" name="slot" className="accent-emerald" checked={!custom && slot === s.start} onChange={() => { setSlot(s.start); setCustom(''); }} />{fmtDateTime(s.start, tz)}</label>)}</fieldset>}
        {sel.status === 'pending' && <Field label="…or a different time (your device timezone)" hint="Times snap to the slot grid (default 30 minutes).">{(a) => <Input {...a} type="datetime-local" step={1800} value={custom} onChange={(e) => setCustom(e.target.value)} />}</Field>}
        {sel.status === 'alternative_proposed' && <Notice>Confirming uses the time you proposed: {fmtDateTime(sel.proposedStart, tz)}.</Notice>}
        <Field label="Assign to">{(a) => <Select {...a} value={staff} onChange={(e) => setStaff(e.target.value)}><option value="">Me</option>{(team.data?.data ?? []).map((s: any) => <option key={s.userId} value={s.userId}>{s.name} ({label(s.role)})</option>)}</Select>}</Field></>}
      {mode === 'propose' && <Field label="Alternative time">{(a) => <Input {...a} type="datetime-local" step={1800} value={custom} onChange={(e) => setCustom(e.target.value)} />}</Field>}
      {['propose', 'reject', 'cancel', 'complete', 'no_show'].includes(mode) && <Field label={mode === 'complete' || mode === 'no_show' ? 'Outcome notes' : 'Note to customer (optional)'}>{(a) => <Textarea {...a} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSel(null)}>Back</Button><Button loading={busy} variant={['reject', 'cancel', 'no_show'].includes(mode) ? 'danger' : 'primary'} disabled={mode === 'propose' && !custom} onClick={submit}>{label(mode)}</Button></div></div>}</Modal></>;
}
export default function Bookings() { return <><PageHeader title="Viewings" subtitle="Requests do not reserve a property. Overlapping slots for the same agent or property are blocked by the server." /><BookingsTable /></>; }
