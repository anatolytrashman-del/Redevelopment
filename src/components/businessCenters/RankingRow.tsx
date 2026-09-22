import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { BusinessCenter } from '../../data/businessCenters';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { shortName, shortAddress } from '../../lib/businessCenterDisplay';
import { PhotoBlock } from './BusinessCenterVisuals';

export function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-faint">{label}</span>
      <span className="text-[13.5px] font-bold leading-snug text-ink">{children}</span>
    </div>
  );
}

export function RankingRow({ center, place, cells }: { center: BusinessCenter; place: number; cells: React.ReactNode }) {
  return (
    <Link
      to={`/minsk/bcminsk/${center.slug}`}
      className={cn('group flex items-start gap-4 p-4 transition-colors hover:border-primary/40', glassCardClass)}
      style={glassCardShadow}
    >
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold',
          place <= 3 ? 'bg-primary text-white' : 'bg-surface-muted text-ink',
        )}
      >
        {place}
      </span>
      <div className="relative h-[88px] w-[118px] shrink-0 overflow-hidden rounded-control">
        {/* sizes = ширина миниатюры выше, не каталожная сетка (см. PhotoBlock). */}
        <PhotoBlock center={center} variant="card" sizes="118px" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-base font-bold leading-snug text-ink">{shortName(center)}</h2>
        <p className="text-xs text-ink-faint">{[center.yearBuilt, shortAddress(center.address)].filter(Boolean).join(', ')}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">{cells}</div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-primary" />
    </Link>
  );
}
