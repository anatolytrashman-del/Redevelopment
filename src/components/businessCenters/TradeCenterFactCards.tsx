import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { RetailInfo } from '../../data/businessCenters';
import { moreFactsLabel } from '../../lib/tradeCenterFactsReviews';
import { glassCardShadow } from '../../lib/glass';
import { retailCardClass } from './tradeCenterRetailStyle';

export function TradeCenterFactCards({ facts }: { facts: NonNullable<RetailInfo['factCards']> }) {
  const [expanded, setExpanded] = useState(false);
  if (!facts.length) return null;
  const visible = expanded ? facts : facts.slice(0, 6);
  return (
    <section id="facts" className={retailCardClass} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <span className="rounded-lg bg-icon-bg p-1"><Lightbulb className="h-5 w-5 text-icon" /></span>
        Интересные факты
      </h2>
      <div className="grid gap-x-7 rounded-[20px] border border-border bg-white px-5 sm:grid-cols-2 sm:px-6">
        {visible.map((fact, index) => (
          <div key={index} className="border-b border-border py-5 last:border-b-0 sm:[&:nth-child(2n+1):nth-last-child(2)]:border-b-0">
            <h3 className="text-base font-bold leading-snug text-ink sm:text-lg">{fact.headline}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{fact.text}</p>
          </div>
        ))}
      </div>
      {!expanded && facts.length > 6 && (
        <button type="button" aria-expanded={false} onClick={() => setExpanded(true)} className="self-start rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink">
          {moreFactsLabel(facts.length - 6)}
        </button>
      )}
    </section>
  );
}
