import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CreditCard, FileSignature, Paperclip, Plus, Receipt, Wrench } from 'lucide-react';
import { useAct, useApi } from '@/lib/hooks';
import { api, errMsg, uuid } from '@/lib/api';
import { Badge, Button, Card, Confirm, DataTable, Empty, ErrorState, Field, Input, MockBanner, Modal, Notice, PageHeader, Select, Skeleton, Stat, Textarea } from '@/components/ui';
import { fmtDate, fmtDateTime, label, money } from '@/lib/format';

export function TenantHome() {
  const { data, isLoading, error, refetch } = useApi('/me/tenancies/home'); const d = data?.data;
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;
  if (isLoading) return <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  const t = d.activeTenancy;
  if (!t) return <Card><Empty title="No active tenancy yet" hint="Your tenant portal activates once a lease is accepted by both sides and activated by the company. Pending leases are under My lease." action={<Link to="/tenant/lease" className="btn-primary">View my lease</Link>} /></Card>;
  const out = Object.entries(d.outstanding ?? {}) as [string, number][];
  return <><PageHeader title="Home" subtitle={`${t.propertyId?.title} · ${[t.propertyId?.location?.district, t.propertyId?.location?.city].filter(Boolean).join(', ')}`} />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Next rent due" value={d.nextDue ? fmtDate(d.nextDue.dueDate) : '—'} sub={d.nextDue && money(d.nextDue.outstandingMinor, d.nextDue.currency)} />
      <Stat label="Outstanding balance" value={out.length ? out.map(([c, m]) => money(m, c)).join(' · ') : money(0, t.terms.currency)} tone={d.overdueCount ? 'danger' : undefined} sub={d.overdueCount ? `${d.overdueCount} overdue` : 'All up to date'} />
      <Stat label="Lease ends" value={fmtDate(t.terms.endDate)} sub={`${money(t.terms.rentMinor, t.terms.currency)} / ${t.terms.frequency}`} />
      <Stat label="Open maintenance" value={d.openMaintenanceRequests} sub={<Link className="text-emerald-text hover:underline" to="/tenant/maintenance">View requests</Link>} /></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card className="p-5"><h2 className="mb-3 font-semibold">Recent payments <Badge tone="amber">Demo</Badge></h2>
      {d.recentPayments.length === 0 ? <p className="text-sm text-muted">No payments recorded yet.</p> : <ul className="divide-y divide-line text-sm">{d.recentPayments.map((p: any) => <li key={p._id} className="flex justify-between py-2"><span>{fmtDate(p.createdAt)} · <span className="text-muted">{label(p.invoiceType)}</span></span><span className="num font-medium">{money(p.amountMinor, p.currency)}</span></li>)}</ul>}</Card>
      <Card className="space-y-3 p-5"><h2 className="font-semibold">Quick actions</h2><div className="flex flex-wrap gap-2"><Link to="/tenant/invoices" className="btn-primary"><CreditCard className="h-4 w-4" aria-hidden />Pay rent</Link><Link to="/tenant/maintenance" className="btn-secondary"><Wrench className="h-4 w-4" aria-hidden />Report an issue</Link><Link to="/tenant/lease" className="btn-secondary"><FileSignature className="h-4 w-4" aria-hidden />View lease</Link></div></Card></div></>;
}

export function TenantInvoices() {
  const nav = useNavigate(); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useApi('/me/invoices', { page, limit: 15, status: status || undefined }, { keepPrevious: true });
  return <><PageHeader title="Rent & invoices" actions={<Select aria-label="Filter by status" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{['issued', 'partially_paid', 'paid', 'void'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>} />
    <div className="mb-4"><MockBanner /></div>
    <DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} meta={data?.meta} onPage={setPage} onRow={(r) => nav(`/tenant/invoices/${r._id}`)} empty={<Empty icon={<Receipt className="h-5 w-5" />} title="No invoices yet" hint="Invoices are generated when your tenancy is activated." />}
      cols={[{ header: 'Invoice', cell: (r) => <span className="num font-medium text-navy">{r.number}</span> }, { header: 'Type', cell: (r) => label(r.type) }, { header: 'Due', cell: (r) => fmtDate(r.dueDate) },
        { header: 'Amount', className: 'text-right', cell: (r) => <span className="num">{money(r.totalMinor, r.currency)}</span> }, { header: 'Outstanding', className: 'text-right', cell: (r) => <span className="num">{money(r.outstandingMinor, r.currency)}</span> }, { header: 'Status', cell: (r) => <Badge status={r.effectiveStatus} /> }]} /></>;
}

export function TenantInvoiceDetail() {
  const { id } = useParams(); const { data, isLoading, error, refetch } = useApi(`/me/invoices/${id}`); const { act, busy } = useAct();
  const [open, setOpen] = useState(false); const [scenario, setScenario] = useState('success'); const [amount, setAmount] = useState(''); const [result, setResult] = useState<any>(null); const [receipt, setReceipt] = useState<any>(null);
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>; if (isLoading) return <Skeleton className="h-64" />;
  const i = data.data; const payable = ['issued', 'partially_paid'].includes(i.status) && i.outstandingMinor > 0;
  const pay = async () => {
    const key = uuid(); // one key per user intent; a retried click reuses the SAME attempt server-side
    const body: any = { scenario }; if (amount) body.amountMinor = Math.round(Number(amount) * 100);
    const r = await act(async () => { const a = await api.post(`/me/invoices/${i._id}/payments`, body, { idempotencyKey: key }); return api.post(`/me/payments/attempts/${a.data._id}/complete`); });
    if (r) { setResult(r.data); setOpen(false); }
  };
  return <><PageHeader title={`Invoice ${i.number}`} actions={<><Badge status={i.effectiveStatus} />{payable && <Button onClick={() => { setAmount(''); setOpen(true); }}><CreditCard className="h-4 w-4" aria-hidden />Pay (demo)</Button>}</>} />
    <div className="mb-4"><MockBanner /></div>
    {result && <div className="mb-4"><Notice tone={result.attempt.status === 'succeeded' ? 'success' : result.attempt.status === 'pending' ? 'warn' : 'danger'} title={`Simulated payment ${result.attempt.status}`}>Reference <span className="num">{result.attempt.reference}</span>. {result.attempt.status === 'pending' && 'Open “Pay (demo)” again and complete it to settle the pending payment.'} No real money moved.</Notice></div>}
    <div className="grid gap-4 lg:grid-cols-3"><Card className="p-5 lg:col-span-2"><h2 className="mb-3 font-semibold">Details</h2>
      <ul className="divide-y divide-line text-sm">{i.lineItems.map((l: any, k: number) => <li key={k} className="flex justify-between py-2"><span>{l.description}</span><span className="num">{money(l.amountMinor, i.currency)}</span></li>)}</ul>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">Due date</dt><dd className="font-medium">{fmtDate(i.dueDate)}</dd></div><div><dt className="text-muted">Total</dt><dd className="num font-medium">{money(i.totalMinor, i.currency)}</dd></div><div><dt className="text-muted">Paid</dt><dd className="num font-medium">{money(i.paidMinor, i.currency)}</dd></div><div><dt className="text-muted">Outstanding</dt><dd className="num font-medium">{money(i.outstandingMinor, i.currency)}</dd></div></dl></Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold">Payments</h2>{i.transactions.length === 0 ? <p className="text-sm text-muted">None yet.</p> : <ul className="space-y-3 text-sm">{i.transactions.map((t: any) => <li key={t._id}><div className="flex justify-between"><span>{t.type === 'reversal' ? 'Reversal' : 'Payment'}</span><span className="num font-medium">{t.type === 'reversal' ? '−' : ''}{money(t.amountMinor, t.currency)}</span></div><p className="text-xs text-muted">{fmtDateTime(t.createdAt)} · <span className="num">{t.reference}</span></p>
        {t.type === 'payment' && !t.voided && <button className="text-xs text-emerald-text hover:underline" onClick={async () => setReceipt((await api.get(`/me/payments/transactions/${t._id}/receipt`)).data)}>View simulated receipt</button>}</li>)}</ul>}</Card></div>
    <Modal open={open} onClose={() => setOpen(false)} title="Pay invoice (demo)"><div className="space-y-4"><MockBanner />
      <Field label={`Amount (${i.currency}) — leave empty to pay the full balance`} hint={`Outstanding: ${money(i.outstandingMinor, i.currency)}`}>{(a) => <Input {...a} type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
      <Field label="Simulated outcome" hint="Demo only: choose what the mock provider should do.">{(a) => <Select {...a} value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="success">Succeeds</option><option value="failure">Fails</option><option value="pending">Stays pending, then settles</option></Select>}</Field>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={pay}>Simulate payment</Button></div></div></Modal>
    <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Simulated receipt">{receipt && <div className="space-y-3 text-sm"><Notice tone="warn" title={receipt.watermark}>{receipt.notice}</Notice><dl className="grid grid-cols-2 gap-2"><dt className="text-muted">Invoice</dt><dd className="num">{receipt.invoiceNumber}</dd><dt className="text-muted">Amount</dt><dd className="num">{money(receipt.amountMinor, receipt.currency)}</dd><dt className="text-muted">Date</dt><dd>{fmtDateTime(receipt.paidAt)}</dd><dt className="text-muted">Reference</dt><dd className="num break-all">{receipt.receiptFor}</dd></dl></div>}</Modal></>;
}

export function TenantLease() {
  const { data, isLoading, error, refetch } = useApi('/me/tenancies'); const { act, busy } = useAct(); const [accept, setAccept] = useState<any>(null);
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>; if (isLoading) return <Skeleton className="h-48" />;
  const rows: any[] = data?.data ?? [];
  if (!rows.length) return <Card><Empty title="No lease yet" hint="When a company approves your application and prepares a lease, it will appear here for your review." /></Card>;
  return <><PageHeader title="My lease" />{rows.map((t) => <Card key={t._id} className="mb-4 p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{t.propertyId?.title}</h2><p className="text-sm text-muted">Contract {t.contract?.reference} · v{t.contract?.version}</p></div><Badge status={t.status} /></div>
    <dl className="grid gap-3 text-sm sm:grid-cols-3">{[['Start', fmtDate(t.terms.startDate)], ['End', fmtDate(t.terms.endDate)], ['Rent', `${money(t.terms.rentMinor, t.terms.currency)} / ${t.terms.frequency}`], ['Due day', `Day ${t.terms.dueDay}`], ['Deposit', money(t.terms.depositMinor, t.terms.currency)], ['Notice period', `${t.terms.noticeDays} days`]].map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="num font-medium">{v}</dd></div>)}</dl>
    {t.terms.fees?.length > 0 && <p className="mt-3 text-sm text-muted">Agreed fees: {t.terms.fees.map((f: any) => `${f.name} ${money(f.amountMinor, t.terms.currency)}`).join(', ')}</p>}{t.terms.renewalTerms && <p className="mt-2 text-sm"><span className="text-muted">Renewal terms: </span>{t.terms.renewalTerms}</p>}
    {t.status === 'pending' && <div className="mt-4 space-y-3 border-t border-line pt-4">{!t.acceptance?.companyAt ? <Notice>The company is still finalising this lease. You will be notified when it is ready to accept.</Notice>
      : t.acceptance?.tenantAt ? <Notice tone="success">You accepted on {fmtDate(t.acceptance.tenantAt)}. Awaiting activation by the company. {t.terms.depositMinor > 0 && <>Your deposit invoice is under <Link className="underline" to="/tenant/invoices">Rent &amp; invoices</Link>.</>}</Notice>
      : <><Notice tone="warn">Accepting records your agreement to these terms. Your tenancy only starts once the company activates it.</Notice><Button onClick={() => setAccept(t)}><FileSignature className="h-4 w-4" aria-hidden />Review &amp; accept lease</Button></>}</div>}</Card>)}
    <Confirm open={!!accept} onClose={() => setAccept(null)} title="Accept this lease?" confirmLabel="I accept" busy={busy} onConfirm={async () => { await act(() => api.post(`/me/tenancies/${accept._id}/accept`), 'Lease accepted'); setAccept(null); }}><p>You confirm you have read the rent, duration, deposit, due date, fees and conditions shown on this page.</p></Confirm></>;
}

const CATS = ['plumbing', 'electrical', 'structural', 'doors_locks', 'appliances', 'cleaning', 'other'];
export function TenantMaintenance() {
  const nav = useNavigate(); const { data, isLoading, error, refetch } = useApi('/me/maintenance', { limit: 50 }); const ten = useApi('/me/tenancies'); const { act, busy } = useAct();
  const active = (ten.data?.data ?? []).find((t: any) => t.status === 'active'); const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: 'plumbing', title: '', description: '', priority: 'normal' }); const file = useRef<HTMLInputElement>(null); const [files, setFiles] = useState<File[]>([]);
  const submit = async () => {
    const r = await act(async () => { const c = await api.post('/me/maintenance', { ...f, tenancyId: active._id }); for (const fl of files.slice(0, 8)) await api.upload(`/me/maintenance/${c.data._id}/attachments`, fl); return c; }, f.priority === 'emergency' ? 'Emergency report sent to staff' : 'Request submitted');
    if (r) { setOpen(false); setF({ category: 'plumbing', title: '', description: '', priority: 'normal' }); setFiles([]); }
  };
  return <><PageHeader title="Maintenance" actions={<Button disabled={!active} onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />New request</Button>} />
    {!active && <div className="mb-4"><Notice>You need an active tenancy to submit maintenance requests.</Notice></div>}
    <DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} onRow={(r) => nav(`/tenant/maintenance/${r._id}`)} empty={<Empty icon={<Wrench className="h-5 w-5" />} title="No requests" hint="Report plumbing, electrical or other issues and track progress here." />}
      cols={[{ header: 'Issue', cell: (r) => <span className="font-medium text-navy">{r.title}</span> }, { header: 'Category', cell: (r) => label(r.category) }, { header: 'Priority', cell: (r) => <Badge status={r.priority} /> }, { header: 'Status', cell: (r) => <Badge status={r.status} /> }, { header: 'Submitted', cell: (r) => fmtDate(r.createdAt) }]} />
    <Modal open={open} onClose={() => setOpen(false)} title="Report an issue"><div className="space-y-4">
      {f.priority === 'emergency' && <Notice tone="danger" title="Emergency reports are flagged to staff immediately">This app does not replace emergency services and does not guarantee an immediate human response. If anyone is in danger, call your local emergency number now.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Category">{(a) => <Select {...a} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>}</Field><Field label="Urgency">{(a) => <Select {...a} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="emergency">Emergency</option></Select>}</Field></div>
      <Field label="Short title">{(a) => <Input {...a} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} />}</Field>
      <Field label="Describe the issue">{(a) => <Textarea {...a} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={3000} />}</Field>
      <div><input ref={file} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Attach photos" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 8))} /><Button variant="secondary" size="sm" onClick={() => file.current?.click()}><Paperclip className="h-4 w-4" aria-hidden />Attach photos ({files.length}/8)</Button>{files.length > 0 && <p className="mt-1 text-xs text-muted">{files.map((x) => x.name).join(', ')}</p>}</div>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant={f.priority === 'emergency' ? 'danger' : 'primary'} loading={busy} disabled={f.title.trim().length < 3 || f.description.trim().length < 5} onClick={submit}>{f.priority === 'emergency' ? <><AlertTriangle className="h-4 w-4" aria-hidden />Send emergency report</> : 'Submit request'}</Button></div></div></Modal></>;
}
export function TenantMaintenanceDetail() {
  const { id } = useParams(); const { data, isLoading, error, refetch } = useApi(`/me/maintenance/${id}`); const { act, busy } = useAct(); const [msg, setMsg] = useState('');
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>; if (isLoading) return <Skeleton className="h-64" />;
  const r = data.data;
  return <><PageHeader title={r.title} subtitle={`${label(r.category)} · submitted ${fmtDateTime(r.createdAt)}`} actions={<><Badge status={r.priority} /><Badge status={r.status} /></>} />
    {r.priority === 'emergency' && <div className="mb-4"><Notice tone="danger">{r.emergencyDisclaimer}</Notice></div>}
    <div className="grid gap-4 lg:grid-cols-3"><Card className="space-y-4 p-5 lg:col-span-2"><p className="whitespace-pre-line text-sm">{r.description}</p>
      {r.attachments?.length > 0 && <div className="flex flex-wrap gap-2">{r.attachments.map((a: any) => <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><Paperclip className="h-3.5 w-3.5" aria-hidden />{a.name}</a>)}</div>}
      {r.resolution && <Notice tone="success" title="Resolution">{r.resolution}</Notice>}
      <div className="border-t border-line pt-4"><h2 className="mb-2 font-semibold">Conversation</h2>{r.comments?.length ? <ul className="space-y-2">{r.comments.map((c: any, k: number) => <li key={k} className={`rounded-ctl p-3 text-sm ${c.authorType === 'staff' ? 'bg-emerald-soft' : 'bg-mutedbg'}`}><p className="text-xs text-muted">{c.authorType === 'staff' ? 'Staff' : 'You'} · {fmtDateTime(c.at)}</p>{c.message}</li>)}</ul> : <p className="text-sm text-muted">No messages yet.</p>}
        {!['closed'].includes(r.status) && <div className="mt-3 flex gap-2"><Input aria-label="Add a follow-up" placeholder="Add follow-up information" value={msg} onChange={(e) => setMsg(e.target.value)} /><Button loading={busy} disabled={!msg.trim()} onClick={async () => { if (await act(() => api.post(`/me/maintenance/${r._id}/comments`, { message: msg }), 'Sent')) setMsg(''); }}>Send</Button></div>}</div>
      {['resolved', 'closed'].includes(r.status) && <Button variant="secondary" loading={busy} onClick={() => act(() => api.post(`/me/maintenance/${r._id}/reopen`, { message: 'The problem is not resolved.' }), 'Request reopened')}>Reopen — problem persists</Button>}</Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold">Progress</h2><ol className="space-y-3 text-sm">{[...(r.history ?? [])].reverse().map((h: any, k: number) => <li key={k} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald" /><div><p className="font-medium text-navy">{label(h.status)}</p><p className="text-xs text-muted">{fmtDateTime(h.at)}</p></div></li>)}</ol></Card></div></>;
}
