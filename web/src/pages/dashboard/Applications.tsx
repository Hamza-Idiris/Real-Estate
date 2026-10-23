import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAct, useApi, useCo } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, DataTable, Empty, Modal, Notice, PageHeader, Select, Textarea } from '@/components/ui';
import { fmtDate, label } from '@/lib/format';
import { LeaseTermsForm } from './Tenancies';

const ST = ['submitted', 'under_review', 'information_required', 'approved', 'rejected', 'withdrawn', 'expired'];
export function ApplicationsTable({ extra = {}, openId }: { extra?: Record<string, any>; openId?: string }) {
  const co = useCo(); const { can } = useAuth(); const { act, busy } = useAct(); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [sel, setSel] = useState<string | null>(openId ?? null); const [msg, setMsg] = useState(''); const [lease, setLease] = useState(false);
  const { data, isLoading, error, refetch } = useApi(co.path('/applications'), { ...extra, page, limit: 15, status: status || undefined }, { keepPrevious: true });
  const one = useApi(sel ? co.path(`/applications/${sel}`) : null); const a = one.data?.data;
  const set = async (s: string) => { if (await act(() => api.post(`${co.base}/applications/${a._id}/status`, { status: s, message: msg || undefined }), `Application ${label(s).toLowerCase()}`)) { setMsg(''); } };
  const terminal = a && ['approved', 'rejected', 'withdrawn', 'expired'].includes(a.status);
  return <><div className="mb-4"><Select aria-label="Filter by status" className="w-52" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All submitted</option>{ST.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
    <DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} meta={data?.meta} onPage={setPage} onRow={(r) => setSel(r._id)} empty={<Empty title="No applications" hint="Submitted rental applications appear here. Drafts are never visible to staff." />}
      cols={[{ header: 'Applicant', cell: (r) => <span className="font-medium text-navy">{r.applicantId?.name}</span> }, { header: 'Property', cell: (r) => r.propertyId?.title }, { header: 'Submitted', cell: (r) => fmtDate(r.createdAt) }, { header: 'Status', cell: (r) => <Badge status={r.status} /> }]} />
    <Modal open={!!sel} onClose={() => setSel(null)} title="Application review" wide>{!a ? <p className="text-sm text-muted">Loading…</p> : <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2"><Badge status={a.status} /><span className="text-muted">{a.propertyId?.title}</span></div>
      <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(a.form ?? {}).map(([k, v]: any) => <div key={k}><dt className="text-xs text-muted">{label(k)}</dt><dd>{k === 'desiredMoveIn' ? fmtDate(v) : String(v)}</dd></div>)}</dl>
      {a.documents?.length > 0 && <div><p className="mb-1 font-medium text-navy">Documents</p><ul>{a.documents.map((d: any) => <li key={d.url}><a className="text-emerald-text hover:underline" href={d.url} target="_blank" rel="noreferrer">{d.name}</a></li>)}</ul><p className="text-xs text-muted">Links expire after 10 minutes. Access to this application was logged.</p></div>}
      {a.infoRequests?.length > 0 && <div><p className="mb-1 font-medium text-navy">Information requests</p><ul className="space-y-1">{a.infoRequests.map((r: any, i: number) => <li key={i} className="rounded-ctl bg-mutedbg p-2"><b>You:</b> {r.message}{r.response && <><br /><b>Applicant:</b> {r.response}</>}</li>)}</ul></div>}
      {can('application.review') && !terminal && <><Textarea aria-label="Message to applicant" rows={2} placeholder="Message to applicant (required when requesting information)" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-2">{a.status === 'submitted' && <Button loading={busy} onClick={() => set('under_review')}>Start review</Button>}
          {a.status === 'under_review' && <><Button variant="secondary" loading={busy} disabled={!msg.trim()} onClick={() => set('information_required')}>Request information</Button><Button variant="danger" loading={busy} onClick={() => set('rejected')}>Reject</Button><Button loading={busy} onClick={() => set('approved')}>Approve</Button></>}
          {a.status === 'information_required' && <Button variant="danger" loading={busy} onClick={() => set('rejected')}>Reject</Button>}</div></>}
      {a.status === 'approved' && <Notice tone="success" title="Approved — this does not start a tenancy">Prepare a lease for the applicant to review and accept.{can('lease.manage') && <div className="mt-2"><Button size="sm" onClick={() => setLease(true)}>Prepare lease</Button></div>}</Notice>}</div>}</Modal>
    <Modal open={lease} onClose={() => setLease(false)} title="Prepare lease" wide>{a && <LeaseTermsForm submitLabel="Create lease proposal" onSubmit={async (terms) => { const r = await act(() => api.post(`${co.base}/tenancies`, { applicationId: a._id, terms }), 'Lease proposal created'); if (r) { setLease(false); setSel(null); } }} busy={busy} />}</Modal></>;
}
export default function Applications() { const { id } = useParams(); return <><PageHeader title="Rental applications" subtitle="Approval does not activate a tenancy. A lease must be accepted by both parties and activated." /><ApplicationsTable openId={id} /></>; }
