import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, Bath, BedDouble, CalendarPlus, ChevronLeft, ChevronRight, FileSignature, ImageOff, MapPin, Ruler, Sofa } from 'lucide-react';
import { useApi, useAct } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, ErrorState, Field, Input, Modal, Notice, Select, Skeleton, Textarea } from '@/components/ui';
import { PropertyCard, priceLabel } from '@/components/PropertyCard';
import { label, money } from '@/lib/format';

const times = Array.from({ length: 20 }, (_, i) => { const m = 8 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
const bookingSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name'), phone: z.string().trim().min(5, 'Enter a phone number'), email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  s1d: z.string().min(1, 'Choose a date'), s1t: z.string().min(1), s2d: z.string().optional(), s2t: z.string().optional(), message: z.string().max(1000).optional(),
});
const toIso = (d?: string, t?: string) => (d && t ? new Date(`${d}T${t}:00`).toISOString() : null);
const today = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function ViewingForm({ p, onDone }: { p: any; onDone: () => void }) {
  const { user } = useAuth(); const { act, busy } = useAct();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof bookingSchema>>({ resolver: zodResolver(bookingSchema), defaultValues: { name: user?.name, phone: user?.phone, email: user?.email, s1t: '10:00', s2t: '10:00' } });
  const submit = handleSubmit(async (v) => {
    const slots = [toIso(v.s1d, v.s1t), toIso(v.s2d, v.s2t)].filter(Boolean);
    const r = await act(() => api.post('/me/bookings', { propertyId: p.id, slots, contact: { name: v.name, phone: v.phone, ...(v.email && { email: v.email }) }, message: v.message || undefined }), 'Viewing requested. We will notify you when staff respond.');
    if (r) onDone();
  });
  return <form onSubmit={submit} className="space-y-4" noValidate>
    <Notice>A viewing is only a visit. It does not reserve the property. Times use your device&apos;s timezone.</Notice>
    <Field label="Full name" error={errors.name?.message}>{(a) => <Input {...a} {...register('name')} autoComplete="name" />}</Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone" error={errors.phone?.message}>{(a) => <Input {...a} {...register('phone')} type="tel" autoComplete="tel" />}</Field><Field label="Email (optional)" error={errors.email?.message}>{(a) => <Input {...a} {...register('email')} type="email" autoComplete="email" />}</Field></div>
    <fieldset className="space-y-2"><legend className="label">Preferred times (up to two)</legend>
      <div className="grid grid-cols-[1fr_auto] gap-2"><Field label="First choice date" error={errors.s1d?.message}>{(a) => <Input {...a} type="date" min={today()} {...register('s1d')} />}</Field><Field label="Time">{(a) => <Select {...a} {...register('s1t')}>{times.map((t) => <option key={t}>{t}</option>)}</Select>}</Field></div>
      <div className="grid grid-cols-[1fr_auto] gap-2"><Field label="Second choice date (optional)">{(a) => <Input {...a} type="date" min={today()} {...register('s2d')} />}</Field><Field label="Time">{(a) => <Select {...a} {...register('s2t')}>{times.map((t) => <option key={t}>{t}</option>)}</Select>}</Field></div></fieldset>
    <Field label="Message (optional)">{(a) => <Textarea {...a} rows={3} {...register('message')} />}</Field>
    <Button type="submit" loading={busy} className="w-full">Request viewing</Button>
  </form>;
}
const appSchema = z.object({
  fullName: z.string().trim().min(2), phone: z.string().trim().min(5), email: z.string().email(), occupants: z.coerce.number().int().min(1).max(20),
  employmentStatus: z.enum(['employed', 'self_employed', 'student', 'other']), desiredMoveIn: z.string().min(1, 'Choose a date'), desiredTermMonths: z.coerce.number().int().min(1).max(60), notes: z.string().max(1000).optional(),
});
function ApplicationForm({ p, onDone }: { p: any; onDone: () => void }) {
  const { user } = useAuth(); const { act, busy } = useAct();
  const { register, handleSubmit, formState: { errors } } = useForm<any>({ resolver: zodResolver(appSchema), defaultValues: { fullName: user?.name, phone: user?.phone, email: user?.email, occupants: 1, employmentStatus: 'employed', desiredTermMonths: 12 } });
  const submit = handleSubmit(async (v: any) => {
    const r = await act(() => api.post('/me/applications', { propertyId: p.id, submit: true, form: { ...v, desiredMoveIn: new Date(v.desiredMoveIn).toISOString(), notes: v.notes || undefined } }), 'Application submitted. Track it in My account.');
    if (r) onDone();
  });
  return <form onSubmit={submit} className="space-y-4" noValidate>
    <Notice>We only ask for what is needed to assess your application. You can upload supporting documents afterwards from My account.</Notice>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Full name" error={errors.fullName?.message as string}>{(a) => <Input {...a} {...register('fullName')} />}</Field><Field label="Phone" error={errors.phone?.message as string}>{(a) => <Input {...a} {...register('phone')} type="tel" />}</Field></div>
    <Field label="Email" error={errors.email?.message as string}>{(a) => <Input {...a} {...register('email')} type="email" />}</Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Number of occupants" error={errors.occupants?.message as string}>{(a) => <Input {...a} type="number" min={1} {...register('occupants')} />}</Field>
      <Field label="Employment status">{(a) => <Select {...a} {...register('employmentStatus')}><option value="employed">Employed</option><option value="self_employed">Self-employed</option><option value="student">Student</option><option value="other">Other</option></Select>}</Field></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Desired move-in date" error={errors.desiredMoveIn?.message as string}>{(a) => <Input {...a} type="date" min={today()} {...register('desiredMoveIn')} />}</Field><Field label="Desired lease length (months)" error={errors.desiredTermMonths?.message as string}>{(a) => <Input {...a} type="number" min={1} max={60} {...register('desiredTermMonths')} />}</Field></div>
    <Field label="Notes (optional)">{(a) => <Textarea {...a} rows={3} {...register('notes')} />}</Field>
    <Button type="submit" loading={busy} className="w-full">Submit application</Button>
  </form>;
}

export default function PropertyDetail() {
  const { ref } = useParams(); const loc = useLocation(); const { user } = useAuth();
  const { data, isLoading, error, refetch } = useApi(`/public/properties/${ref}`);
  const sim = useApi(`/public/properties/${ref}/similar`);
  const [i, setI] = useState(0); const [modal, setModal] = useState<'view' | 'apply' | null>(null);
  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState error={error} onRetry={() => refetch()} /><div className="text-center"><Link to="/properties" className="btn-secondary mt-2">Back to search</Link></div></div>;
  if (isLoading) return <div className="mx-auto max-w-7xl space-y-4 px-4 py-8"><Skeleton className="aspect-[16/7]" /><Skeleton className="h-8 w-1/2" /><Skeleton className="h-40" /></div>;
  const p = data.data; const media: any[] = p.media ?? []; const loc2 = p.location;
  const nav = (d: number) => setI((i + d + media.length) % media.length);
  const need = (k: 'view' | 'apply') => user ? setModal(k) : null;
  const gate = (k: 'view' | 'apply', icon: any, text: string, primary?: boolean) => user
    ? <Button variant={primary ? 'primary' : 'secondary'} className="w-full" disabled={!p.available} onClick={() => need(k)}>{icon}{text}</Button>
    : <Link to="/login" state={{ from: loc.pathname }} className={`${primary ? 'btn-primary' : 'btn-secondary'} w-full`}>{icon}Sign in to {text.toLowerCase()}</Link>;
  return <div className="mx-auto max-w-7xl px-4 py-6">
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted"><Link to="/properties" className="hover:underline">Properties</Link> / <span className="text-navy">{p.reference}</span></nav>
    <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-mutedbg sm:aspect-[16/10]">
        {media[i] ? <img src={media[i].url} alt={media[i].alt || `${p.title} photo ${i + 1}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-muted"><ImageOff className="h-8 w-8" aria-label="No photos yet" /></div>}
        {media.length > 1 && <><button onClick={() => nav(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"><ChevronLeft className="h-4 w-4" /></button><button onClick={() => nav(1)} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"><ChevronRight className="h-4 w-4" /></button><span className="num absolute bottom-3 right-3 rounded-full bg-navy/80 px-2.5 py-0.5 text-xs text-white">{i + 1} / {media.length}</span></>}
      </div>
      <div className="hidden grid-cols-2 gap-2 sm:grid sm:grid-rows-3 sm:content-start">{media.slice(0, 6).map((m, k) => <button key={k} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`} aria-current={k === i} className={`aspect-[4/3] overflow-hidden rounded-ctl ${k === i ? 'ring-2 ring-emerald' : ''}`}><img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" /></button>)}</div>
    </div>
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-8">
        <div><div className="mb-2 flex flex-wrap gap-2"><Badge tone="blue">{p.transaction === 'rent' ? 'For rent' : 'For sale'}</Badge>{p.verified && <Badge tone="green"><BadgeCheck className="mr-1 h-3 w-3" aria-hidden />Verified listing</Badge>}<Badge status={p.available ? 'available' : 'occupied'}>{p.available ? 'Available' : 'Currently unavailable'}</Badge></div>
          <h1 className="text-3xl font-semibold">{p.title}</h1><p className="mt-1 flex items-center gap-1 text-muted"><MapPin className="h-4 w-4" aria-hidden />{[loc2.district, loc2.city, loc2.country].filter(Boolean).join(', ')} · <span className="num">Ref {p.reference}</span></p></div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[[BedDouble, 'Bedrooms', p.bedrooms], [Bath, 'Bathrooms', p.bathrooms], [Ruler, 'Size', p.sizeSqm ? `${p.sizeSqm} m²` : '—'], [Sofa, 'Furnished', p.furnished ? 'Yes' : 'No']].map(([I, l, v]: any) => <Card key={l} className="p-3"><dt className="flex items-center gap-1.5 text-xs text-muted"><I className="h-3.5 w-3.5" aria-hidden />{l}</dt><dd className="num mt-1 font-semibold text-navy">{v}</dd></Card>)}</dl>
        <section><h2 className="mb-2 text-lg font-semibold">About this property</h2><p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{p.description || 'No description provided.'}</p></section>
        {p.amenities?.length > 0 && <section><h2 className="mb-2 text-lg font-semibold">Amenities</h2><ul className="flex flex-wrap gap-2">{p.amenities.map((a: string) => <li key={a} className="rounded-full bg-mutedbg px-3 py-1 text-sm">{label(a)}</li>)}</ul></section>}
        <section><h2 className="mb-2 text-lg font-semibold">Location</h2>
          {loc2.lat != null && loc2.lng != null ? <iframe title={`Map of ${p.title}`} loading="lazy" className="h-64 w-full rounded-card border border-line" src={`https://www.openstreetmap.org/export/embed.html?bbox=${loc2.lng - 0.01},${loc2.lat - 0.007},${loc2.lng + 0.01},${loc2.lat + 0.007}&layer=mapnik&marker=${loc2.lat},${loc2.lng}`} />
            : <Card className="p-4 text-sm text-muted">Map unavailable. The exact address is shared when your viewing is confirmed.</Card>}<p className="mt-2 text-xs text-muted">Exact address is not shown publicly.</p></section>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit"><Card className="space-y-4 p-5">
        <div><p className="num text-3xl font-semibold text-navy">{priceLabel(p)}</p>{p.transaction === 'rent' && p.depositMinor > 0 && <p className="mt-1 text-sm text-muted">Deposit: <span className="num">{money(p.depositMinor, p.currency)}</span> (refundable)</p>}
          {p.fees?.length > 0 && <ul className="mt-1 text-xs text-muted">{p.fees.map((f: any) => <li key={f.name}>{f.name}: <span className="num">{money(f.amountMinor, p.currency)}</span></li>)}</ul>}</div>
        {!p.available && <Notice tone="warn">This property is not currently available. Availability is confirmed by the company when you act.</Notice>}
        {gate('view', <CalendarPlus className="h-4 w-4" aria-hidden />, 'Schedule a viewing', true)}
        {p.transaction === 'rent' && gate('apply', <FileSignature className="h-4 w-4" aria-hidden />, 'Apply to rent')}
        <p className="text-xs text-muted">Listed by {p.company?.name ?? 'a property company'}. Contact happens through viewing requests and applications.</p>
      </Card></aside>
    </div>
    {sim.data?.data?.length > 0 && <section className="mt-12"><h2 className="mb-4 text-xl font-semibold">Similar properties</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{sim.data.data.slice(0, 3).map((s: any) => <PropertyCard key={s.id} p={s} />)}</div></section>}
    <Modal open={modal === 'view'} onClose={() => setModal(null)} title="Schedule a viewing"><ViewingForm p={p} onDone={() => setModal(null)} /></Modal>
    <Modal open={modal === 'apply'} onClose={() => setModal(null)} title="Rental application"><ApplicationForm p={p} onDone={() => setModal(null)} /></Modal>
  </div>;
}
