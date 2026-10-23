import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ClipboardList, Plus, Wrench } from 'lucide-react';
import { useApi, useCo } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Badge, Card, Empty, ErrorState, Input, Notice, PageHeader, Skeleton, Stat } from '@/components/ui';
import { BarChart } from '@/components/BarChart';
import { fmtDate, money } from '@/lib/format';

const cur = (o?: Record<string, number>) => { const e = Object.entries(o ?? {}); return e.length ? e.map(([c, m]) => money(m, c)).join(' · ') : money(0, 'USD'); };
export default function Overview() {
  const { can, active } = useAuth(); const co = useCo();
  const m = new Date(); const [from, setFrom] = useState(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).toISOString().slice(0, 10));
  const ov = useApi(can('report.read') ? co.path('/reports/overview') : null, { from, to: new Date(new Date(to).getTime() + 86_400_000).toISOString() });
  const fin = useApi(can('report.read') ? co.path('/reports/financial') : null);
  const d = ov.data?.data; const tz = active?.company.timezone;
  const firstCur = Object.keys(fin.data?.data?.monthly ?? {})[0];
  const months = firstCur ? fin.data.data.monthly[firstCur].map((x: any) => ({ name: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][x.month - 1], expected: x.expected, collected: x.collected })) : null;
  const quick = <Card className="p-5"><h2 className="mb-3 font-semibold">Quick actions</h2><div className="flex flex-wrap gap-2">
    {can('property.create') && <Link className="btn-primary" to="/dashboard/properties?new=1"><Plus className="h-4 w-4" aria-hidden />Add property</Link>}
    {can('booking.manage') && <Link className="btn-secondary" to="/dashboard/bookings"><CalendarClock className="h-4 w-4" aria-hidden />Viewings</Link>}
    {can('application.review') && <Link className="btn-secondary" to="/dashboard/applications"><ClipboardList className="h-4 w-4" aria-hidden />Applications</Link>}
    {can('maintenance.read') && <Link className="btn-secondary" to="/dashboard/maintenance"><Wrench className="h-4 w-4" aria-hidden />Maintenance</Link>}</div></Card>;
  if (!can('report.read')) return <><PageHeader title="Overview" subtitle={active?.company.name} />{quick}</>;
  if (ov.error) return <Card><ErrorState error={ov.error} onRetry={ov.refetch} /></Card>;
  return <><PageHeader title="Overview" subtitle={active?.company.name} actions={<div className="flex items-center gap-2"><label className="sr-only" htmlFor="ov-from">From</label><Input id="ov-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="text-muted">to</span><label className="sr-only" htmlFor="ov-to">To</label><Input id="ov-to" type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></div>} />
    {ov.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div> : <>
      {d.isEmpty && <div className="mb-4"><Notice title="Nothing to report yet">Add your first property to start seeing occupancy, rent and expense figures. No numbers are invented.</Notice></div>}
      <div className="mb-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Total properties" value={d.properties.total} /><Stat label="Available" value={d.properties.available} /><Stat label="Occupied" value={d.properties.occupied} /><Stat label="Under maintenance" value={d.properties.maintenance} /></div>
      <div className="mb-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Active tenancies" value={d.activeTenancies} /><Stat label="Viewings (next 14 days)" value={d.upcomingViewings14d} /><Stat label="Pending applications" value={d.pendingApplications} /><Stat label="Maintenance awaiting action" value={d.maintenanceAwaitingAction} tone={d.openEmergencies ? 'danger' : undefined} sub={d.openEmergencies ? `${d.openEmergencies} emergency` : undefined} /></div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Rent expected" value={cur(d.rentExpected)} sub="Invoices due in period" /><Stat label="Rent collected (demo)" value={cur(d.rentCollected)} sub="Simulated payments, net of reversals" /><Stat label="Overdue rent" value={cur(d.overdueRent)} tone={d.overdueInvoiceCount ? 'danger' : undefined} sub={`${d.overdueInvoiceCount} invoice(s)`} /><Stat label="Operating expenses" value={cur(d.operatingExpenses)} sub="Approved only" /></div>
      <div className="mb-6 grid gap-4 lg:grid-cols-3"><Card className="p-5 lg:col-span-2"><h2 className="mb-1 font-semibold">Rent: expected vs collected ({new Date().getUTCFullYear()}{firstCur ? `, ${firstCur}` : ''})</h2>
        {months ? <BarChart label="Monthly expected and collected rent" data={months} format={(n) => money(n, firstCur)} series={[{ key: 'expected', name: 'Expected', color: '#233F50' }, { key: 'collected', name: 'Collected (demo)', color: '#16856B' }]} /> : <Empty title="No rent invoices yet" hint="Rent trends appear after your first lease is activated." />}</Card>{quick}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5"><h2 className="mb-3 font-semibold">Outstanding invoices</h2>{d.outstandingInvoices.length ? <ul className="divide-y divide-line text-sm">{d.outstandingInvoices.map((i: any) => <li key={i._id} className="flex justify-between gap-2 py-2"><span className="truncate"><span className="num">{i.number}</span><br /><span className="text-xs text-muted">{i.propertyId?.title} · due {fmtDate(i.dueDate, tz)}</span></span><span className="num shrink-0">{money(i.totalMinor - i.paidMinor, i.currency)}</span></li>)}</ul> : <p className="text-sm text-muted">None outstanding.</p>}</Card>
        <Card className="p-5"><h2 className="mb-3 font-semibold">Lease expirations (60 days)</h2>{d.upcomingLeaseExpirations.length ? <ul className="divide-y divide-line text-sm">{d.upcomingLeaseExpirations.map((t: any) => <li key={t._id} className="flex justify-between py-2"><span className="truncate">{t.propertyId?.title}</span><span className="shrink-0 text-muted">{fmtDate(t.terms.endDate, tz)}</span></li>)}</ul> : <p className="text-sm text-muted">No leases ending soon.</p>}</Card>
        <Card className="p-5"><h2 className="mb-3 font-semibold">Recent maintenance</h2>{d.recentMaintenance.length ? <ul className="divide-y divide-line text-sm">{d.recentMaintenance.map((r: any) => <li key={r._id} className="flex items-center justify-between gap-2 py-2"><Link to={`/dashboard/maintenance?open=${r._id}`} className="flex min-w-0 items-center gap-1.5 truncate hover:underline">{r.priority === 'emergency' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger-text" aria-label="Emergency" />}<span className="truncate">{r.title}</span></Link><Badge status={r.status} /></li>)}</ul> : <p className="text-sm text-muted">No requests.</p>}</Card></div>
      <details className="mt-6 text-xs text-muted"><summary className="cursor-pointer">Reporting basis</summary><ul className="mt-2 list-disc space-y-1 pl-5">{Object.values(d.basis).map((b: any) => <li key={b}>{b}</li>)}</ul></details></>}</>;
}
