import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { useAct, useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Confirm, DataTable, Empty, Modal, PageHeader, Tabs, Textarea, Notice } from '@/components/ui';
import { fmtDateTime, fmtDate, label } from '@/lib/format';

function Viewings() {
  const { data, isLoading, error, refetch } = useApi('/me/bookings', { limit: 50 }); const { act, busy } = useAct(); const [cancel, setCancel] = useState<any>(null);
  return <><DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} empty={<Empty title="No viewing requests yet" hint="Find a property and request a viewing." action={<Link className="btn-primary" to="/properties">Browse properties</Link>} />}
    cols={[
      { header: 'Property', cell: (b) => <Link to={`/properties/${b.propertyId?.reference}`} className="font-medium text-navy hover:underline">{b.propertyId?.title ?? 'Property'}</Link> },
      { header: 'When', cell: (b) => b.status === 'alternative_proposed' ? <span>Proposed: {fmtDateTime(b.proposedStart)}</span> : b.confirmedStart ? fmtDateTime(b.confirmedStart) : <span className="text-muted">Requested {fmtDateTime(b.requestedSlots?.[0]?.start)}</span> },
      { header: 'Status', cell: (b) => <Badge status={b.status} /> },
      { header: '', cell: (b) => <div className="flex justify-end gap-2">
        {b.status === 'alternative_proposed' && <Button size="sm" loading={busy} onClick={() => act(() => api.post(`/me/bookings/${b._id}/respond`, { action: 'accept_alternative' }), 'Viewing confirmed')}>Accept new time</Button>}
        {['pending', 'confirmed', 'alternative_proposed'].includes(b.status) && <Button size="sm" variant="secondary" onClick={() => setCancel(b)}>Cancel</Button>}</div> },
    ]} />
    <Confirm open={!!cancel} onClose={() => setCancel(null)} title="Cancel this viewing?" confirmLabel="Cancel viewing" danger busy={busy} onConfirm={async () => { await act(() => api.post(`/me/bookings/${cancel._id}/respond`, { action: 'cancel' }), 'Viewing cancelled'); setCancel(null); }}><p>The agent will be notified.</p></Confirm></>;
}
function Applications() {
  const { data, isLoading, error, refetch } = useApi('/me/applications', { limit: 50 }); const { act, busy } = useAct();
  const [sel, setSel] = useState<any>(null); const detail = useApi(sel ? `/me/applications/${sel}` : null); const [msg, setMsg] = useState(''); const file = useRef<HTMLInputElement>(null);
  const a = detail.data?.data; const lastReq = a?.infoRequests?.[a.infoRequests.length - 1];
  return <><DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} onRow={(r) => setSel(r._id)} empty={<Empty title="No applications yet" hint="Applying is separate from viewing. Open a property and choose Apply to rent." />}
    cols={[{ header: 'Property', cell: (r) => <span className="font-medium text-navy">{r.propertyId?.title}</span> }, { header: 'Submitted', cell: (r) => fmtDate(r.createdAt) }, { header: 'Status', cell: (r) => <Badge status={r.status} /> }]} />
    <Modal open={!!sel} onClose={() => setSel(null)} title="Application" wide>{!a ? <p className="text-sm text-muted">Loading…</p> : <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2"><Badge status={a.status} />{a.decisionNote && <span className="text-muted">Note: {a.decisionNote}</span>}</div>
      {a.status === 'information_required' && <Notice tone="warn" title="The company needs more information">{lastReq?.message}</Notice>}
      {a.status === 'information_required' && <div className="space-y-2"><Textarea aria-label="Your response" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} /><Button loading={busy} disabled={!msg.trim()} onClick={async () => { if (await act(() => api.post(`/me/applications/${a._id}/respond`, { message: msg }), 'Response sent')) setMsg(''); }}>Send response</Button></div>}
      <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(a.form ?? {}).map(([k, v]: any) => <div key={k}><dt className="text-xs text-muted">{label(k)}</dt><dd>{k === 'desiredMoveIn' ? fmtDate(v) : String(v)}</dd></div>)}</dl>
      <div><p className="mb-1 font-medium text-navy">Supporting documents</p>{a.documents?.length ? <ul className="space-y-1">{a.documents.map((d: any) => <li key={d.url}><a className="text-emerald-text hover:underline" href={d.url} target="_blank" rel="noreferrer">{d.name}</a> <span className="text-xs text-muted">(link expires in 10 minutes)</span></li>)}</ul> : <p className="text-muted">None uploaded.</p>}
        {['draft', 'submitted', 'under_review', 'information_required'].includes(a.status) && <><input ref={file} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Choose a document" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await act(() => api.upload(`/me/applications/${a._id}/documents`, f), 'Document uploaded'); e.target.value = ''; }} />
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => file.current?.click()}><Upload className="h-4 w-4" aria-hidden />Upload PDF or image (max 5 MB)</Button></>}</div>
      <div className="flex justify-end gap-2">{a.status === 'draft' && <Button loading={busy} onClick={() => act(() => api.post(`/me/applications/${a._id}/submit`), 'Submitted')}>Submit</Button>}
        {['draft', 'submitted', 'under_review', 'information_required'].includes(a.status) && <Button variant="secondary" loading={busy} onClick={() => act(() => api.post(`/me/applications/${a._id}/withdraw`), 'Application withdrawn')}>Withdraw</Button>}</div>
      {a.status === 'approved' && <Notice tone="success">Approved. The company will now prepare your lease; you will be notified to review and accept it.</Notice>}
    </div>}</Modal></>;
}
export default function Account() {
  const { user, memberships, isAdmin } = useAuth(); const [tab, setTab] = useState('v');
  const { data: ten } = useApi('/me/tenancies'); const hasT = (ten?.data ?? []).length > 0;
  return <><PageHeader title="My account" subtitle={user?.email} actions={<>{hasT && <Link className="btn-secondary" to="/tenant">Tenant portal</Link>}{memberships.length > 0 && <Link className="btn-secondary" to="/dashboard">Company dashboard</Link>}{isAdmin && <Link className="btn-secondary" to="/admin">Platform admin</Link>}</>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: 'v', label: 'Viewings' }, { id: 'a', label: 'Applications' }, { id: 'p', label: 'Profile & privacy' }]} />
    {tab === 'v' && <Viewings />}{tab === 'a' && <Applications />}{tab === 'p' && <Profile />}</>;
}
function Profile() {
  const { user, reload } = useAuth(); const { act, busy } = useAct(); const [name, setName] = useState(user?.name ?? ''); const [phone, setPhone] = useState(user?.phone ?? '');
  const exportData = async () => { const r = await api.get('/me/data-export'); const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'my-estateflow-data.json'; a.click(); URL.revokeObjectURL(url); };
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  return <div className="grid gap-4 md:grid-cols-2">
    <Card className="space-y-3 p-5"><h2 className="font-semibold">Profile</h2><label className="label" htmlFor="pn">Name</label><input id="pn" className="input" value={name} onChange={(e) => setName(e.target.value)} /><label className="label" htmlFor="pp">Phone</label><input id="pp" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Button loading={busy} onClick={async () => { if (await act(() => api.patch('/me/profile', { name, phone: phone || undefined }), 'Profile updated')) reload(); }}>Save</Button></Card>
    <Card className="space-y-3 p-5"><h2 className="font-semibold">Security</h2><label className="label" htmlFor="cp">Current password</label><input id="cp" type="password" autoComplete="current-password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
      <label className="label" htmlFor="np">New password</label><input id="np" type="password" autoComplete="new-password" className="input" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
      <Button loading={busy} disabled={!pw.currentPassword || !pw.newPassword} onClick={async () => { if (await act(() => api.post('/auth/change-password', pw), 'Password changed. Other sessions were signed out.')) setPw({ currentPassword: '', newPassword: '' }); }}>Change password</Button></Card>
    <Card className="space-y-2 p-5 md:col-span-2"><h2 className="font-semibold">Your data</h2><p className="text-sm text-muted">Download the personal data we hold about you (profile, viewings, applications).</p><Button variant="secondary" onClick={exportData}>Download my data</Button></Card></div>;
}
