import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy } from 'lucide-react';
import { useAct, useApi, useCo } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Modal, Notice, PageHeader, Select, Stat, Textarea } from '@/components/ui';
import { fmtDate, fmtDateTime, label } from '@/lib/format';

const ROLES = ['manager', 'agent', 'accountant'];
const PERMS = ['branch.manage', 'audit.read', 'property.read', 'property.create', 'property.update', 'property.archive', 'booking.manage', 'application.review', 'lease.manage', 'tenant.read', 'invoice.read', 'invoice.manage', 'payment.record_mock', 'expense.read', 'expense.manage', 'expense.approve', 'maintenance.read', 'maintenance.manage', 'maintenance.assign', 'report.read'];
const DEFAULTS: Record<string, string[]> = { manager: PERMS.filter((p) => p !== 'expense.approve').concat('expense.approve'), agent: ['property.read', 'property.update', 'booking.manage', 'application.review', 'maintenance.read', 'maintenance.manage'], accountant: ['property.read', 'tenant.read', 'invoice.read', 'invoice.manage', 'payment.record_mock', 'expense.read', 'expense.manage', 'report.read'] };

export function Staff() {
  const co = useCo(); const { act, busy } = useAct(); const { data, isLoading, error, refetch } = useApi(co.path('/staff')); const [m, setM] = useState<any>(null); const [invite, setInvite] = useState(false); const [token, setToken] = useState('');
  const [f, setF] = useState({ email: '', role: 'agent', scope: 'assigned', permissions: DEFAULTS.agent, status: 'active' }); const branches = useApi(m || invite ? co.path('/branches') : null); const [bids, setBids] = useState<string[]>([]);
  const edit = (x: any) => { setM(x); setF({ email: x.email, role: x.role, scope: x.scope, permissions: x.permissions, status: x.status }); setBids((x.branchIds ?? []).map(String)); };
  const save = async () => {
    const body: any = { role: f.role, scope: f.scope, permissions: f.permissions, branchIds: bids };
    const r = m ? await act(() => api.patch(`${co.base}/staff/${m._id ?? m.id}`, { ...body, status: f.status === 'deactivated' ? 'deactivated' : m.status === 'invited' ? undefined : 'active' }), 'Access updated') : await act(() => api.post(`${co.base}/staff/invite`, { ...body, email: f.email }), 'Invitation created');
    if (r) { if (!m) setToken(r.data.inviteToken); setM(null); setInvite(false); }
  };
  const toggle = (p: string) => setF({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] });
  const form = <div className="space-y-4">{!m && <Field label="Email">{(a) => <Input {...a} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>}
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Role">{(a) => <Select {...a} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, permissions: DEFAULTS[e.target.value] })}>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</Select>}</Field><Field label="Property access" hint="Assigned = only listed branches / properties / assigned staff.">{(a) => <Select {...a} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="assigned">Assigned only</option><option value="all">All company properties</option></Select>}</Field></div>
    {f.scope === 'assigned' && <fieldset><legend className="label">Branches</legend><div className="flex flex-wrap gap-3">{(branches.data?.data ?? []).map((b: any) => <label key={b._id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" checked={bids.includes(b._id)} onChange={(e) => setBids(e.target.checked ? [...bids, b._id] : bids.filter((x) => x !== b._id))} />{b.name}</label>)}</div><p className="mt-1 text-xs text-muted">Specific properties can also be assigned from each property&apos;s Staff tab.</p></fieldset>}
    <fieldset><legend className="label">Permissions</legend><div className="grid gap-1.5 sm:grid-cols-2">{PERMS.map((p) => <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" checked={f.permissions.includes(p)} onChange={() => toggle(p)} />{p}</label>)}</div><p className="mt-1 text-xs text-muted">The server also caps these at the role&apos;s ceiling (e.g. only owners can manage staff or reverse payments).</p></fieldset>
    {m && m.status !== 'invited' && <Field label="Account status">{(a) => <Select {...a} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="deactivated">Deactivated</option></Select>}</Field>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setM(null); setInvite(false); }}>Cancel</Button><Button loading={busy} disabled={!m && !f.email} onClick={save}>{m ? 'Save' : 'Create invitation'}</Button></div></div>;
  return <><PageHeader title="Staff & access" subtitle="Effective access = role ceiling ∩ granted permissions ∩ property scope, enforced on the server." actions={<Button onClick={() => { setF({ email: '', role: 'agent', scope: 'assigned', permissions: DEFAULTS.agent, status: 'active' }); setBids([]); setInvite(true); }}>Invite staff</Button>} />
    {token && <div className="mb-4"><Notice tone="warn" title="Invitation token (shown once)">Email delivery is not configured. Send this token securely; the invitee signs in and enters it under “Accept invitation”.<div className="mt-2 flex items-center gap-2"><code className="break-all rounded bg-white/70 px-2 py-1 text-xs">{token}</code><Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(token)}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</Button></div></Notice></div>}
    <DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} onRow={(r) => r.role !== 'owner' && edit(r)} empty={<Empty title="No staff yet" />}
      cols={[{ header: 'Member', cell: (r) => <div><p className="font-medium text-navy">{r.name ?? r.email}</p><p className="text-xs text-muted">{r.email}</p></div> }, { header: 'Role', cell: (r) => label(r.role) }, { header: 'Scope', cell: (r) => label(r.scope) }, { header: 'Status', cell: (r) => <Badge status={r.status} /> }]} />
    <Modal open={invite || !!m} onClose={() => { setM(null); setInvite(false); }} title={m ? `Edit access — ${m.name ?? m.email}` : 'Invite staff'} wide>{form}</Modal></>;
}
export function AcceptInvite() {
  const { act, busy } = useAct(); const { reload } = useAuth(); const nav = useNavigate(); const [t, setT] = useState('');
  return <div className="mx-auto max-w-md"><PageHeader title="Accept invitation" /><Card className="space-y-3 p-5"><Field label="Invitation token">{(a) => <Input {...a} value={t} onChange={(e) => setT(e.target.value.trim())} />}</Field><Button loading={busy} disabled={t.length < 20} onClick={async () => { if (await act(() => api.post('/invitations/accept', { token: t }), 'Invitation accepted')) { await reload(); nav('/dashboard'); } }}>Join company</Button></Card></div>;
}
export function Activity() {
  const co = useCo(); const [page, setPage] = useState(1); const { data, isLoading, error, refetch } = useApi(co.path('/audit'), { page, limit: 25 }, { keepPrevious: true });
  return <><PageHeader title="Audit log" subtitle="Sensitive, financial and administrative actions. Append-only; secrets are never recorded." /><DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} meta={data?.meta} onPage={setPage} empty={<Empty title="Nothing logged yet" />}
    cols={[{ header: 'When', cell: (r) => fmtDateTime(r.createdAt) }, { header: 'Action', cell: (r) => <span className="font-mono text-xs">{r.action}</span> }, { header: 'Entity', cell: (r) => r.entityType ? `${r.entityType} …${String(r.entityId ?? '').slice(-6)}` : '—' }, { header: 'Outcome', cell: (r) => <Badge status={r.outcome === 'success' ? 'completed' : 'failed'}>{r.outcome}</Badge> }]} /></>;
}
export function Settings() {
  const co = useCo(); const { active, reload } = useAuth(); const { act, busy } = useAct(); const c = active!.company as any; const full = useApi(co.path('/')); const s = full.data?.data?.company;
  const [name, setName] = useState(c.name); const [tz, setTz] = useState(c.timezone); const [req, setReq] = useState<boolean | null>(null); const [thr, setThr] = useState<string | null>(null);
  const br = useApi(co.path('/branches')); const [bn, setBn] = useState('');
  return <><PageHeader title="Company settings" /><div className="grid gap-4 lg:grid-cols-2"><Card className="space-y-3 p-5"><h2 className="font-semibold">Company</h2><Field label="Name">{(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} />}</Field><Field label="Timezone (IANA)" hint="Viewing times are shown in this timezone.">{(a) => <Input {...a} value={tz} onChange={(e) => setTz(e.target.value)} />}</Field>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" checked={req ?? s?.settings?.requireCompletedViewing ?? false} onChange={(e) => setReq(e.target.checked)} />Require a completed viewing before applications</label>
    <Field label={`Expense approval threshold (${c.currency}) — above this needs approval`}>{(a) => <Input {...a} type="number" min={0} value={thr ?? ((s?.settings?.expenseApprovalThresholdMinor ?? 0) / 100).toString()} onChange={(e) => setThr(e.target.value)} />}</Field>
    <Button loading={busy} onClick={async () => { if (await act(() => api.patch(`${co.base}/`, { name, timezone: tz, settings: { ...(req !== null && { requireCompletedViewing: req }), ...(thr !== null && { expenseApprovalThresholdMinor: Math.round(Number(thr) * 100) }) } }), 'Settings saved')) reload(); }}>Save</Button></Card>
    <Card className="space-y-3 p-5"><h2 className="font-semibold">Branches</h2><ul className="divide-y divide-line text-sm">{(br.data?.data ?? []).map((b: any) => <li key={b._id} className="flex items-center justify-between py-2">{b.name}<Badge status={b.status} /></li>)}</ul><div className="flex gap-2"><Input aria-label="New branch name" placeholder="New branch name" value={bn} onChange={(e) => setBn(e.target.value)} /><Button loading={busy} disabled={bn.trim().length < 2} onClick={async () => { if (await act(() => api.post(`${co.base}/branches`, { name: bn }), 'Branch added')) setBn(''); }}>Add</Button></div></Card></div></>;
}
const ncSchema = z.object({ name: z.string().trim().min(2, 'Enter the company name'), country: z.string().trim().min(2, 'Enter the country'), currency: z.string(), timezone: z.string().min(3) });
export function NewCompany() {
  const { reload, setActive, memberships } = useAuth(); const nav = useNavigate(); const { act, busy } = useAct();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof ncSchema>>({ resolver: zodResolver(ncSchema), defaultValues: { name: '', currency: 'USD', timezone: 'Africa/Mogadishu', country: 'Somalia' } });
  return <div className="mx-auto max-w-lg px-4 py-10"><PageHeader title="Register your company" subtitle="You become the owner and can invite staff afterwards." />
    {memberships.length === 0 && <div className="mb-4"><Notice>You are not a member of any company yet. Create one, or accept an invitation from your employer.</Notice></div>}
    <Card className="p-5"><form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { const r = await act(() => api.post('/companies', v), 'Company created'); if (r) { await reload(); setActive(r.data._id); nav('/dashboard'); } })}>
      <Field label="Company name" error={errors.name?.message}>{(a) => <Input {...a} {...register('name')} />}</Field><Field label="Country" error={errors.country?.message}>{(a) => <Input {...a} {...register('country')} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Currency">{(a) => <Select {...a} {...register('currency')}>{['USD', 'EUR', 'GBP', 'KES', 'ETB', 'AED', 'SOS'].map((c) => <option key={c}>{c}</option>)}</Select>}</Field><Field label="Timezone">{(a) => <Input {...a} {...register('timezone')} />}</Field></div>
      <Button type="submit" loading={busy} className="w-full">Create company</Button></form><p className="mt-4 text-center text-sm"><a className="text-emerald-text hover:underline" href="/dashboard/join">I have an invitation token</a></p></Card></div>;
}
export function PlatformAdmin({ page }: { page: 'stats' | 'companies' | 'users' }) {
  const { act, busy } = useAct(); const [pg, setPg] = useState(1); const [q, setQ] = useState(''); const [sel, setSel] = useState<any>(null); const [reason, setReason] = useState('');
  const stats = useApi(page === 'stats' ? '/admin/stats' : null); const list = useApi(page !== 'stats' ? `/admin/${page}` : null, { page: pg, limit: 20, q: q || undefined }, { keepPrevious: true }); const s = stats.data?.data;
  if (page === 'stats') return <><PageHeader title="Platform overview" subtitle="Counts only. Private company data (tenants, invoices, documents) is not accessible from here." /><div className="grid gap-4 sm:grid-cols-3">{s && Object.entries(s).map(([k, v]) => <Stat key={k} label={label(k.replace(/([A-Z])/g, ' $1').toLowerCase())} value={v as number} />)}</div></>;
  const kind = page === 'companies' ? 'companies' : 'users'; const row = sel;
  return <><PageHeader title={page === 'companies' ? 'Companies' : 'Users'} /><div className="mb-4"><Input aria-label="Search" className="max-w-xs" placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPg(1); }} /></div>
    <DataTable loading={list.isLoading} error={list.error} onRetry={list.refetch} rows={list.data?.data} meta={list.data?.meta} onPage={setPg}
      cols={[{ header: 'Name', cell: (r) => <div><p className="font-medium text-navy">{r.name}</p><p className="text-xs text-muted">{r.email ?? r.country}</p></div> }, { header: 'Created', cell: (r) => fmtDate(r.createdAt) }, { header: 'Status', cell: (r) => <Badge status={r.status} /> },
        { header: '', cell: (r) => r.platformRole === 'super_admin' ? <span className="text-xs text-muted">Platform admin</span> : <div className="flex justify-end"><Button size="sm" variant={r.status === 'active' ? 'secondary' : 'primary'} onClick={() => { setSel(r); setReason(''); }}>{r.status === 'active' ? 'Suspend' : 'Reactivate'}</Button></div> }]} />
    <Modal open={!!row} onClose={() => setSel(null)} title={`${row?.status === 'active' ? 'Suspend' : 'Reactivate'} ${row?.name ?? ''}`}><div className="space-y-3"><Notice tone="warn">This action is audit-logged with your reason.</Notice><Field label="Reason (required)">{(a) => <Textarea {...a} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSel(null)}>Cancel</Button><Button loading={busy} disabled={reason.trim().length < 5} variant={row?.status === 'active' ? 'danger' : 'primary'} onClick={async () => { if (await act(() => api.patch(`/admin/${kind}/${row._id}/status`, { status: row.status === 'active' ? 'suspended' : 'active', reason }), 'Status updated')) setSel(null); }}>Confirm</Button></div></div></Modal></>;
}
