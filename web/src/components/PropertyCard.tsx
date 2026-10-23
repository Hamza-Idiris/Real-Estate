import { Link } from 'react-router-dom';
import { Bath, BedDouble, BadgeCheck, MapPin, Ruler, ImageOff } from 'lucide-react';
import { Badge, Skeleton } from './ui';
import { money, label } from '@/lib/format';

export const priceLabel = (p: any) => `${money(p.priceMinor, p.currency)}${p.transaction === 'rent' ? ` / ${(p.rentFrequency ?? 'monthly').replace('ly', '').replace('month', 'mo').replace('quarter', 'qtr').replace('year', 'yr')}` : ''}`;
export function PropertyCard({ p }: { p: any }) {
  const img = p.media?.[0];
  return <Link to={`/properties/${p.reference}`} className="group card block overflow-hidden transition-shadow hover:shadow-md">
    <div className="relative aspect-[4/3] bg-mutedbg">
      {img ? <img src={img.url} alt={img.alt || p.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        : <div className="grid h-full place-items-center text-muted"><ImageOff className="h-6 w-6" aria-label="No photo" /></div>}
      <div className="absolute left-3 top-3 flex gap-1.5"><Badge tone="gray"><span className="text-navy">{p.transaction === 'rent' ? 'For rent' : 'For sale'}</span></Badge>
        {p.verified && <Badge tone="green"><BadgeCheck className="mr-1 h-3 w-3" aria-hidden />Verified</Badge>}</div>
      {!p.available && <div className="absolute inset-x-0 bottom-0 bg-navy/80 px-3 py-1 text-xs text-white">Currently unavailable</div>}
    </div>
    <div className="space-y-2 p-4">
      <p className="num text-lg font-semibold text-navy">{priceLabel(p)}</p>
      <h3 className="line-clamp-1 text-sm font-medium text-ink">{p.title}</h3>
      <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5" aria-hidden />{[p.location?.district, p.location?.city].filter(Boolean).join(', ')}</p>
      <div className="flex items-center gap-4 border-t border-line pt-2 text-xs text-muted">
        {p.type !== 'land' && <><span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" aria-hidden />{p.bedrooms}<span className="sr-only"> bedrooms</span></span><span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" aria-hidden />{p.bathrooms}<span className="sr-only"> bathrooms</span></span></>}
        {p.sizeSqm ? <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" aria-hidden />{p.sizeSqm} m²</span> : null}<span className="ml-auto">{label(p.type)}</span>
      </div>
    </div>
  </Link>;
}
export const CardSkeleton = () => <div className="card overflow-hidden"><Skeleton className="aspect-[4/3] rounded-none" /><div className="space-y-2 p-4"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>;
