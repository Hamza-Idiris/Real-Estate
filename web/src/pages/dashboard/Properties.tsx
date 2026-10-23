import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, Eye, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useAct, useApi, useCo } from '@/lib/hooks';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Confirm, DataTable, Empty, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, Tabs, Textarea } from '@/components/ui';
import { fmtDate, fmtDateTime, label, money, toMinor, fromMinor } from '@/lib/format';
import { BookingsTable } from './Bookings';
import { ApplicationsTable } from './Applications';
import { TenanciesTable } from './Tenancies';
import { InvoicesTable } from './Invoices';
import { MaintenanceTable } from './Maintenance';

const TYPES = ['apartment', 'house', 'villa', 'office', 'shop', 'land', 'warehouse', 'other'];
const AMEN = ['water', 'electricity', 'security', 'parking', 'wifi', 'generator', 'balcony', 'garden', 'air_conditioning'];
const CUR = ['USD', 'EUR', 'GBP', 'KES', 'ETB', 'AED', 'SOS'];
const schema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(140), description: z.string().max(5000).optional(), branchId: z.string().min(1, 'Choose a branch'),
  type: z.enum(TYPES as [string, ...string[]]), transaction: z.enum(['rent', 'sale']), currency: z.enum(CUR as [string, ...string[]]),
  price: z.coerce.number().min(0, 'Enter a price'), rentFrequency: z.enum(['monthly', 'quarterly', 'yearly']).optional(), deposit: z.coerce.number().min(0).optional(),
  country: z.string().trim().min(2, 'Required'), city: z.string().trim().min(1, 'Required'), district: z.string().optional(), address: z.string().optional(), lat: z.string().optional(), lng: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(50), bathrooms: z.coerce.number().int().min(0).max(50), sizeSqm: z.string().optional(), furnished: z.boolean(), amenities: z.array(z.string()),
}).refine((v) => v.transaction !== 'rent' || !!v.rentFrequency, { path: ['rentFrequency'], message: 'Choose a rent frequency' });

function PropertyForm({ p, onSaved }: { p?: any; onSaved: (p: any) => void }) {
  const co = useCo(); const { act, busy } = useAct(); const { active } = useAuth(); const br = useApi(co.path('/branches'));
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<any>({ resolver: zodResolver(schema), defaultValues: p ? {
    title: p.title, description: p.description, branchId: String(p.branchId), type: p.type, transaction: p.transaction, currency: p.currency, price: fromMinor(p.priceMinor), rentFrequency: p.rentFrequency, deposit: fromMinor(p.depositMinor ?? 0),
    country: p.location.country, city: p.location.city, district: p.location.district, address: p.location.address, lat: p.location.lat?.toString(), lng: p.location.lng?.toString(), bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm?.toString(), furnished: p.furnished, amenities: p.amenities ?? [],
  } : { type: 'apartment', transaction: 'rent', currency: active?.company.currency ?? 'USD', rentFrequency: 'monthly', bedrooms: 1, bathrooms: 1, furnished: false, amenities: [], country: '', city: '' } });
  const tx = watch('transaction'); const am: string[] = watch('amenities') ?? [];
  const save = handleSubmit(async (v: any) => {
    const body = { branchId: v.branchId, title: v.title, description: v.description || '', type: v.type, transaction: v.transaction, priceMinor: toMinor(v.price), currency: v.currency, ...(v.transaction === 'rent' && { rentFrequency: v.rentFrequency, depositMinor: toMinor(v.deposit || 0) }),
      location: { country: v.country, city: v.city, ...(v.district && { district: v.district }), ...(v.address && { address: v.address }), ...(v.lat && v.lng && { lat: Number(v.lat), lng: Number(v.lng) }) },
      bedrooms: v.bedrooms, bathrooms: v.bathrooms, ...(v.sizeSqm && { sizeSqm: Number(v.sizeSqm) }), furnished: v.furnished, amenities: v.amenities };
    const r = await act(() => (p ? api.patch(`${co.base}/properties/${p._id}`, body) : api.post(`${co.base}/properties`, body)), p ? 'Property updated' : 'Property created as a draft');
    if (r) onSaved(r.data);
  });
  return <form onSubmit={save} noValidate className="space-y-4">
    <Field label="Title" error={errors.title?.message as string}>{(a) => <Input {...a} {...register('title')} />}</Field>
    <Field label="Description">{(a) => <Textarea {...a} rows={4} {...register('description')} />}</Field>
    <div className="grid gap-3 sm:grid-cols-3"><Field label="Branch" error={errors.branchId?.message as string}>{(a) => <Select {...a} {...register('branchId')}><option value="">Select…</option>{(br.data?.data ?? []).filter((b: any) => b.status === 'active').map((b: any) => <option key={b._id} value={b._id}>{b.name}</option>)}</Select>}</Field>
      <Field label="Type">{(a) => <Select {...a} {...register('type')}>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>}</Field>
      <Field label="Listing for">{(a) => <Select {...a} {...register('transaction')}><option value="rent">Rent</option><option value="sale">Sale</option></Select>}</Field></div>
    <div className="grid gap-3 sm:grid-cols-4"><Field label="Currency">{(a) => <Select {...a} {...register('currency')}>{CUR.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
      <Field label={tx === 'rent' ? 'Rent per period' : 'Sale price'} error={errors.price?.message as string}>{(a) => <Input {...a} type="number" step="0.01" min="0" {...register('price')} />}</Field>
      {tx === 'rent' && <><Field label="Frequency" error={errors.rentFrequency?.message as string}>{(a) => <Select {...a} {...register('rentFrequency')}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></Select>}</Field><Field label="Deposit">{(a) => <Input {...a} type="number" step="0.01" min="0" {...register('deposit')} />}</Field></>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><Field label="Country" error={errors.country?.message as string}>{(a) => <Input {...a} {...register('country')} />}</Field><Field label="City" error={errors.city?.message as string}>{(a) => <Input {...a} {...register('city')} />}</Field><Field label="District">{(a) => <Input {...a} {...register('district')} />}</Field></div>
    <Field label="Exact address (private — never shown publicly)">{(a) => <Input {...a} {...register('address')} />}</Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Latitude (optional)">{(a) => <Input {...a} inputMode="decimal" {...register('lat')} />}</Field><Field label="Longitude (optional)">{(a) => <Input {...a} inputMode="decimal" {...register('lng')} />}</Field></div>
    <div className="grid gap-3 sm:grid-cols-4"><Field label="Bedrooms" error={errors.bedrooms?.message as string}>{(a) => <Input {...a} type="number" min={0} {...register('bedrooms')} />}</Field><Field label="Bathrooms">{(a) => <Input {...a} type="number" min={0} {...register('bathrooms')} />}</Field><Field label="Size (m²)">{(a) => <Input {...a} type="number" min={0} {...register('sizeSqm')} />}</Field>
      <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" {...register('furnished')} />Furnished</label></div>
    <fieldset><legend className="label">Amenities</legend><div className="flex flex-wrap gap-3">{AMEN.map((a) => <label key={a} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" checked={am.includes(a)} onChange={(e) => setValue('amenities', e.target.checked ? [...am, a] : am.filter((x) => x !== a))} />{label(a)}</label>)}</div></fieldset>
    <div className="flex justify-end"><Button type="submit" loading={busy}>{p ? 'Save changes' : 'Create draft'}</Button></div></form>;
}

export default function Properties() {
  const co = useCo(); const { can } = useAuth(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useApi(co.path('/properties'), { page, limit: 15, status: status || undefined, q: q || undefined }, { keepPrevious: true });
  const creating = sp.get('new') === '1';
  return <><PageHeader title="Properties" actions={can('property.create') && <Button onClick={() => setSp({ new: '1' })}><Plus className="h-4 w-4" aria-hidden />Add property</Button>} />
    <div className="mb-4 flex flex-wrap gap-2"><Input aria-label="Search properties" className="max-w-xs" placeholder="Search title or reference" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <Select aria-label="Filter by listing status" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All (not archived)</option>{['draft', 'published', 'unpublished', 'archived'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
    <DataTable loading={isLoading} error={error} onRetry={refetch} rows={data?.data} meta={data?.meta} onPage={setPage} onRow={(r) => nav(`/dashboard/properties/${r._id}`)}
      empty={<Empty title="No properties yet" hint="Create a draft, add photos, then publish it to the marketplace." action={can('property.create') ? <Button onClick={() => setSp({ new: '1' })}>Add your first property</Button> : undefined} />}
      cols={[{ header: 'Property', cell: (r) => <div><p className="font-medium text-navy">{r.title}</p><p className="num text-xs text-muted">{r.reference} · {r.location.city}</p></div> }, { header: 'Type', cell: (r) => label(r.type) }, { header: 'Price', className: 'text-right', cell: (r) => <span className="num">{money(r.priceMinor, r.currency)}</span> }, { header: 'Listing', cell: (r) => <Badge status={r.listingStatus} /> }, { header: 'Occupancy', cell: (r) => <Badge status={r.occupancyStatus} /> }]} />
    <Modal open={creating} onClose={() => setSp({})} title="New property" wide><PropertyForm onSaved={(p) => { setSp({}); nav(`/dashboard/properties/${p._id}?tab=media`); }} /></Modal></>;
}

function Media({ p }: { p: any }) {
  const co = useCo(); const { act, busy } = useAct(); const file = useRef<HTMLInputElement>(null); const media: any[] = [...(p.media ?? [])].sort((a, b) => a.order - b.order);
  const move = (i: number, d: number) => { const k = media.map((m) => m.key); [k[i], k[i + d]] = [k[i + d], k[i]]; return act(() => api.put(`${co.base}/properties/${p._id}/media/order`, { keys: k }), 'Order saved'); };
  return <div className="space-y-4"><div className="flex items-center gap-3"><input ref={file} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Choose an image" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await act(() => api.upload(`${co.base}/properties/${p._id}/media`, f, { alt: p.title }), 'Image uploaded'); e.target.value = ''; }} />
    <Button onClick={() => file.current?.click()} loading={busy}><ImagePlus className="h-4 w-4" aria-hidden />Upload image</Button><span className="text-xs text-muted">JPG, PNG or WebP, up to 5 MB, max 20 images. The first image is the cover.</span></div>
    {media.length === 0 ? <Card><Empty title="No images yet" hint="Listings need at least one image before they can be published." /></Card> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{media.map((m, i) => <li key={m.key} className="card overflow-hidden"><img src={m.url} alt={m.alt || ''} className="aspect-[4/3] w-full object-cover" /><div className="flex items-center justify-between p-2">
      <span className="text-xs text-muted">{i === 0 ? 'Cover' : `#${i + 1}`}</span><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier"><ArrowUp className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" disabled={i === media.length - 1} onClick={() => move(i, 1)} aria-label="Move later"><ArrowDown className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" aria-label="Remove image" onClick={() => { if (confirm('Remove this image?')) act(() => api.del(`${co.base}/properties/${p._id}/media`, { key: m.key }), 'Image removed'); }}><Trash2 className="h-3.5 w-3.5 text-danger-text" /></Button></div></div></li>)}</ul>}</div>;
}
function Activity({ id }: { id: string }) {
  const co = useCo(); const { can } = useAuth(); const { data, isLoading } = useApi(can('audit.read') ? co.path('/audit') : null, { entityType: 'Property', entityId: id, limit: 25 });
  if (!can('audit.read')) return <Notice>You do not have access to audit history.</Notice>;
  return <DataTable loading={isLoading} rows={data?.data} empty={<Empty title="No activity recorded" />} cols={[{ header: 'When', cell: (r) => fmtDateTime(r.createdAt) }, { header: 'Action', cell: (r) => label(r.action.replace('.', ' ')) }, { header: 'Outcome', cell: (r) => <Badge status={r.outcome === 'success' ? 'completed' : 'failed'}>{r.outcome}</Badge> }]} />;
}
export function PropertyDetailPage() {
  const { id } = useParams(); const co = useCo(); const { can } = useAuth(); const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') ?? 'overview'; const { act, busy } = useAct();
  const { data, isLoading, error, refetch } = useApi(co.path(`/properties/${id}`)); const [archive, setArchive] = useState(false);
  const staff = useApi(tab === 'staff' ? co.path('/staff/assignable') : null); const [sel, setSel] = useState<string[] | null>(null);
  useEffect(() => { if (data?.data && sel === null) setSel((data.data.assignedStaffIds ?? []).map(String)); }, [data, sel]);
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>; if (isLoading) return <Skeleton className="h-64" />;
  const p = data.data; const f = { propertyId: p._id };
  const tabs = [['overview', 'Overview'], ['media', `Media (${p.media?.length ?? 0})`], ['viewings', 'Viewings'], ['applications', 'Applications'], ['leases', 'Leases'], ['invoices', 'Invoices'], ['maintenance', 'Maintenance'], ['staff', 'Staff'], ['activity', 'Activity']].map(([id, label]) => ({ id, label }));
  const publish = () => act(() => api.post(`${co.base}/properties/${p._id}/publish`), 'Published to the marketplace').then(() => refetch());
  return <><PageHeader title={p.title} subtitle={`${p.reference} · ${p.location.city}`} actions={<><Badge status={p.listingStatus} /><Badge status={p.occupancyStatus} />
    <Link className="btn-secondary" to={`/properties/${p.reference}`} target="_blank"><Eye className="h-4 w-4" aria-hidden />Preview{p.listingStatus !== 'published' && ' (public once published)'}</Link>
    {can('property.update') && p.listingStatus !== 'published' && p.listingStatus !== 'archived' && <Button loading={busy} onClick={publish}>Publish</Button>}
    {can('property.update') && p.listingStatus === 'published' && <Button variant="secondary" loading={busy} onClick={() => act(() => api.post(`${co.base}/properties/${p._id}/unpublish`), 'Unpublished')}>Unpublish</Button>}
    {can('property.archive') && p.listingStatus !== 'archived' && <Button variant="ghost" onClick={() => setArchive(true)}>Archive</Button>}</>} />
    <Tabs tabs={tabs} value={tab} onChange={(t) => setSp({ tab: t })} />
    {tab === 'overview' && (can('property.update') && p.listingStatus !== 'archived' ? <Card className="p-5"><PropertyForm p={p} onSaved={() => refetch()} />
      {!p.activeTenancy && <div className="mt-4 flex items-center gap-2 border-t border-line pt-4"><span className="text-sm text-muted">Occupancy:</span>{['available', 'maintenance'].map((o) => <Button key={o} size="sm" variant={p.occupancyStatus === o ? 'primary' : 'secondary'} onClick={() => act(() => api.post(`${co.base}/properties/${p._id}/occupancy`, { occupancyStatus: o }), 'Occupancy updated')}>{label(o)}</Button>)}</div>}</Card> : <Notice>{p.listingStatus === 'archived' ? 'Archived properties are read-only.' : 'You have read-only access.'}</Notice>)}
    {tab === 'media' && <Media p={p} />}
    {tab === 'viewings' && can('booking.manage') && <BookingsTable extra={f} />}{tab === 'applications' && can('application.review') && <ApplicationsTable extra={f} />}
    {tab === 'leases' && can('tenant.read') && <TenanciesTable extra={f} />}{tab === 'invoices' && can('invoice.read') && <InvoicesTable extra={f} />}{tab === 'maintenance' && can('maintenance.read') && <MaintenanceTable extra={f} />}
    {tab === 'staff' && <Card className="space-y-3 p-5"><h2 className="font-semibold">Assigned staff</h2>{!can('staff.manage') ? <p className="text-sm text-muted">Only the owner can change assignments. Currently assigned: {(p.assignedStaffIds ?? []).length}.</p> : <>
      {(staff.data?.data ?? []).map((s: any) => <label key={s.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" checked={(sel ?? []).includes(s.userId)} onChange={(e) => setSel(e.target.checked ? [...(sel ?? []), s.userId] : (sel ?? []).filter((x) => x !== s.userId))} />{s.name} <span className="text-muted">({label(s.role)})</span></label>)}
      <Button loading={busy} onClick={() => act(() => api.put(`${co.base}/properties/${p._id}/staff`, { staffUserIds: sel ?? [] }), 'Assignments saved')}>Save assignments</Button></>}</Card>}
    {tab === 'activity' && <Activity id={p._id} />}
    <Confirm open={archive} onClose={() => setArchive(false)} title="Archive this property?" danger confirmLabel="Archive" busy={busy} onConfirm={async () => { await act(() => api.post(`${co.base}/properties/${p._id}/archive`), 'Property archived'); setArchive(false); refetch(); }}><p>It will be removed from the marketplace and become read-only. Properties with an active or pending lease cannot be archived. Financial history is kept.</p></Confirm></>;
}
export { fmtDate, errMsg };
