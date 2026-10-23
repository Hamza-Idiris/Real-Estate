import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck, FileSignature, KeyRound, Search, ShieldCheck, Home as HomeIcon, Building, Store, Warehouse, Trees, Briefcase } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { Button, Empty, ErrorState, Input, Select } from '@/components/ui';
import { CardSkeleton, PropertyCard } from '@/components/PropertyCard';
import { label } from '@/lib/format';
import { useAuth } from '@/lib/auth';

const typeIcon: Record<string, any> = { apartment: Building, house: HomeIcon, villa: HomeIcon, office: Briefcase, shop: Store, land: Trees, warehouse: Warehouse };

export default function Home() {
  const nav = useNavigate(); const { user } = useAuth();
  const [f, setF] = useState({ transaction: 'rent', city: '', type: '', q: '' });
  const featured = useApi('/public/properties', { limit: 6, sort: 'newest' });
  const facets = useApi('/public/properties/facets');
  const go = (e: FormEvent) => { e.preventDefault(); nav(`/properties?${new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()}`); };
  const items: any[] = featured.data?.data ?? [];
  return <>
    <section className="bg-navy text-white"><div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">Find a place you can trust, and book a viewing in minutes.</h1>
      <p className="mt-4 max-w-xl text-white/75">Browse listings from property companies, check availability, and manage your rental online once you move in.</p>
      <form onSubmit={go} role="search" aria-label="Property search" className="mt-8 grid gap-3 rounded-card bg-surface p-3 shadow-lg sm:grid-cols-[auto_1fr_1fr_1fr_auto]">
        <div role="group" aria-label="Rent or buy" className="flex rounded-ctl bg-mutedbg p-1">{['rent', 'sale'].map((t) => <button key={t} type="button" aria-pressed={f.transaction === t} onClick={() => setF({ ...f, transaction: t })} className={`rounded-lg px-4 text-sm font-medium ${f.transaction === t ? 'bg-surface text-navy shadow-card' : 'text-muted'}`}>{t === 'rent' ? 'Rent' : 'Buy'}</button>)}</div>
        <Input aria-label="City" placeholder="City (e.g. Mogadishu)" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <Select aria-label="Property type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Any type</option>{['apartment', 'house', 'villa', 'office', 'shop', 'land', 'warehouse'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        <Input aria-label="Keyword" placeholder="Keyword or district" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <Button type="submit"><Search className="h-4 w-4" aria-hidden />Search</Button>
      </form></div></section>

    <section className="mx-auto max-w-7xl px-4 pt-14"><div className="mb-5 flex items-end justify-between"><div><h2 className="text-2xl font-semibold">Recently added</h2><p className="text-sm text-muted">Newest published listings</p></div><Link to="/properties" className="flex items-center gap-1 text-sm font-medium text-emerald-text hover:underline">View all <ArrowRight className="h-4 w-4" aria-hidden /></Link></div>
      {featured.isError ? <ErrorState error={featured.error} onRetry={() => featured.refetch()} />
        : featured.isLoading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        : items.length === 0 ? <div className="card"><Empty title="No listings published yet" hint="Property companies are still adding their properties. Check back soon, or list your own." action={<Link to="/register" className="btn-primary">List a property</Link>} /></div>
        : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((p) => <PropertyCard key={p.id} p={p} />)}</div>}</section>

    {(facets.data?.data?.types?.length > 0) && <section className="mx-auto max-w-7xl px-4 pt-14"><h2 className="mb-5 text-2xl font-semibold">Browse by category</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{facets.data.data.types.map((t: any) => { const I = typeIcon[t.type] ?? Building; return <Link key={t.type} to={`/properties?type=${t.type}`} className="card flex flex-col items-center gap-2 p-4 text-center hover:border-emerald"><I className="h-5 w-5 text-emerald-text" aria-hidden /><span className="text-sm font-medium">{label(t.type)}</span><span className="num text-xs text-muted">{t.count} available</span></Link>; })}</div></section>}
    {(facets.data?.data?.locations?.length > 0) && <section className="mx-auto max-w-7xl px-4 pt-14"><h2 className="mb-5 text-2xl font-semibold">Popular locations</h2>
      <div className="flex flex-wrap gap-2">{facets.data.data.locations.map((l: any) => <Link key={`${l.country}${l.city}`} to={`/properties?city=${encodeURIComponent(l.city)}&country=${encodeURIComponent(l.country)}`} className="btn-secondary">{l.city}, {l.country} <span className="num text-muted">({l.count})</span></Link>)}</div></section>}

    <section className="mx-auto max-w-7xl px-4 pt-14"><h2 className="mb-1 text-2xl font-semibold">How viewings work</h2><p className="mb-6 text-sm text-muted">A viewing is a visit, not a reservation. Nothing is held until you apply and sign a lease.</p>
      <ol className="grid gap-4 md:grid-cols-4">{[
        [Search, 'Choose a property', 'Check the details and that it is currently available.'], [CalendarCheck, 'Request a time', 'Suggest up to three times. Staff confirm or propose another.'],
        [KeyRound, 'Visit the property', 'Meet the assigned agent at the confirmed time.'], [FileSignature, 'Apply if it fits', 'Submit a separate rental application, then review and accept the lease.'],
      ].map(([I, t, d]: any, i) => <li key={t} className="card p-5"><div className="mb-3 flex items-center gap-3"><span className="num grid h-7 w-7 place-items-center rounded-full bg-emerald-soft text-sm font-semibold text-emerald-text">{i + 1}</span><I className="h-4 w-4 text-navy" aria-hidden /></div><p className="font-medium text-navy">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></li>)}</ol></section>

    <section className="mx-auto max-w-7xl px-4 pt-14"><div className="grid gap-4 md:grid-cols-2">
      <div className="card flex flex-col items-start gap-3 p-8"><h2 className="text-xl font-semibold">Looking for a home?</h2><p className="text-sm text-muted">Create a free account to book viewings, apply, and track everything in one place.</p>{!user && <Link to="/register" className="btn-primary">Create account</Link>}<Link to="/properties" className="btn-secondary">Browse properties</Link></div>
      <div className="flex flex-col items-start gap-3 rounded-card bg-navy p-8 text-white"><ShieldCheck className="h-6 w-6 text-emerald-text" aria-hidden /><h2 className="text-xl font-semibold text-white">Own or manage property?</h2><p className="text-sm text-white/75">Publish listings, schedule viewings, manage leases, rent invoices, expenses and maintenance from one dashboard.</p><Link to="/dashboard/new" className="btn-primary">Register your company</Link></div></div></section>
  </>;
}
