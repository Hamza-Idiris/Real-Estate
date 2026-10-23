import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, SearchX } from 'lucide-react';
import { useApi, useDebounced } from '@/lib/hooks';
import { Button, Empty, ErrorState, Input, Pagination, Select } from '@/components/ui';
import { CardSkeleton, PropertyCard } from '@/components/PropertyCard';
import { label, toMinor } from '@/lib/format';

const TYPES = ['apartment', 'house', 'villa', 'office', 'shop', 'land', 'warehouse', 'other'];
const AMEN = ['water', 'electricity', 'security', 'parking', 'wifi', 'generator', 'balcony', 'garden', 'air_conditioning'];
const SORTS = [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['size_desc', 'Largest size']];

export default function Search() {
  const [sp, setSp] = useSearchParams(); const [show, setShow] = useState(false);
  const g = (k: string) => sp.get(k) ?? '';
  const set = (k: string, v?: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); n.delete('page'); setSp(n, { replace: true }); };
  const [q, setQ] = useState(g('q')); const dq = useDebounced(q);
  useEffect(() => { if (dq !== g('q')) set('q', dq); /* eslint-disable-next-line */ }, [dq]);
  const params: any = { ...Object.fromEntries(sp), limit: 12 };
  if (sp.get('minPrice')) params.minPrice = toMinor(sp.get('minPrice')!); if (sp.get('maxPrice')) params.maxPrice = toMinor(sp.get('maxPrice')!);
  const { data, isLoading, isFetching, error, refetch } = useApi('/public/properties', params, { keepPrevious: true });
  const amenities = g('amenities').split(',').filter(Boolean);
  const chips = ([['q', 'Keyword'], ['transaction', ''], ['type', ''], ['city', ''], ['district', ''], ['minPrice', 'Min'], ['maxPrice', 'Max'], ['bedrooms', 'Beds ≥'], ['bathrooms', 'Baths ≥'], ['furnished', 'Furnished'], ['amenities', '']] as const).filter(([k]) => g(k));
  const reset = () => { setQ(''); setSp({}, { replace: true }); };
  const filters = <div className="space-y-4">
    <div role="group" aria-label="Rent or sale" className="flex rounded-ctl bg-mutedbg p-1">{[['', 'All'], ['rent', 'Rent'], ['sale', 'Buy']].map(([v, l]) => <button key={v} type="button" aria-pressed={g('transaction') === v} onClick={() => set('transaction', v)} className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${g('transaction') === v ? 'bg-surface text-navy shadow-card' : 'text-muted'}`}>{l}</button>)}</div>
    <div><label className="label" htmlFor="f-type">Property type</label><Select id="f-type" value={g('type')} onChange={(e) => set('type', e.target.value)}><option value="">Any</option>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></div>
    <div className="grid grid-cols-2 gap-2"><div><label className="label" htmlFor="f-country">Country</label><Input id="f-country" value={g('country')} onChange={(e) => set('country', e.target.value)} /></div><div><label className="label" htmlFor="f-city">City</label><Input id="f-city" value={g('city')} onChange={(e) => set('city', e.target.value)} /></div></div>
    <div><label className="label" htmlFor="f-district">District</label><Input id="f-district" value={g('district')} onChange={(e) => set('district', e.target.value)} /></div>
    <div className="grid grid-cols-2 gap-2"><div><label className="label" htmlFor="f-min">Min price</label><Input id="f-min" type="number" min={0} inputMode="decimal" value={g('minPrice')} onChange={(e) => set('minPrice', e.target.value)} /></div><div><label className="label" htmlFor="f-max">Max price</label><Input id="f-max" type="number" min={0} inputMode="decimal" value={g('maxPrice')} onChange={(e) => set('maxPrice', e.target.value)} /></div></div>
    <div className="grid grid-cols-2 gap-2"><div><label className="label" htmlFor="f-bed">Bedrooms (min)</label><Select id="f-bed" value={g('bedrooms')} onChange={(e) => set('bedrooms', e.target.value)}><option value="">Any</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+</option>)}</Select></div><div><label className="label" htmlFor="f-bath">Bathrooms (min)</label><Select id="f-bath" value={g('bathrooms')} onChange={(e) => set('bathrooms', e.target.value)}><option value="">Any</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}</Select></div></div>
    <div><label className="label" htmlFor="f-furn">Furnishing</label><Select id="f-furn" value={g('furnished')} onChange={(e) => set('furnished', e.target.value)}><option value="">Any</option><option value="true">Furnished</option><option value="false">Unfurnished</option></Select></div>
    <fieldset><legend className="label">Amenities</legend><div className="grid grid-cols-2 gap-1.5">{AMEN.map((a) => <label key={a} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" checked={amenities.includes(a)} onChange={(e) => set('amenities', (e.target.checked ? [...amenities, a] : amenities.filter((x) => x !== a)).join(','))} />{label(a)}</label>)}</div></fieldset>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald" checked={g('availability') === 'any'} onChange={(e) => set('availability', e.target.checked ? 'any' : '')} />Include unavailable listings</label>
  </div>;
  return <div className="mx-auto max-w-7xl px-4 py-8">
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Input aria-label="Search keyword" type="search" placeholder="Search by title, city or district" className="max-w-md" value={q} onChange={(e) => setQ(e.target.value)} />
      <Select aria-label="Sort by" className="w-52" value={g('sort') || 'newest'} onChange={(e) => set('sort', e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      <Button variant="secondary" className="lg:hidden" onClick={() => setShow(!show)} aria-expanded={show}><SlidersHorizontal className="h-4 w-4" aria-hidden />Filters</Button>
    </div>
    {chips.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">{chips.map(([k, l]) => <button key={k} onClick={() => { if (k === 'q') setQ(''); set(k); }} className="flex items-center gap-1 rounded-full bg-emerald-soft px-3 py-1 text-xs font-medium text-emerald-hover">{l ? `${l}: ` : ''}{label(g(k).replace(/,/g, ', '))}<X className="h-3 w-3" aria-label="Remove filter" /></button>)}<button onClick={reset} className="text-xs font-medium text-muted underline">Reset all</button></div>}
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className={`${show ? 'block' : 'hidden'} card h-fit p-4 lg:sticky lg:top-20 lg:block`} aria-label="Filters">{filters}<Button variant="ghost" className="mt-4 w-full" onClick={reset}>Reset filters</Button></aside>
      <section aria-label="Results" aria-busy={isFetching}>
        {error ? <div className="card"><ErrorState error={error} onRetry={() => refetch()} /></div>
          : isLoading ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          : data?.data?.length === 0 ? <div className="card"><Empty icon={<SearchX className="h-5 w-5" />} title="No properties match your search" hint="Try removing a filter, widening the price range, or searching a nearby district." action={<Button variant="secondary" onClick={reset}>Reset filters</Button>} /></div>
          : <><p className="mb-3 text-sm text-muted" role="status"><span className="num">{data.meta.total}</span> properties{isFetching ? ' · updating…' : ''}</p>
              <div className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 ${isFetching ? 'opacity-70' : ''}`}>{data.data.map((p: any) => <PropertyCard key={p.id} p={p} />)}</div>
              <div className="card mt-6"><Pagination meta={data.meta} onPage={(p) => { const n = new URLSearchParams(sp); n.set('page', String(p)); setSp(n); window.scrollTo({ top: 0 }); }} /></div></>}
      </section>
    </div></div>;
}
