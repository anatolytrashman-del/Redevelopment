import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { RetailInfo } from '../../data/businessCenters';
import { moreFactsLabel } from '../../lib/tradeCenterFactsReviews';
import { factCardsPreview } from '../../lib/tradeCenterSpoilerPreview';
import { CategorySpoiler } from '../ui/CategorySpoiler';
import { pluralRu } from '../../lib/pluralRu';

export function TradeCenterFactCards({
  facts,
  index,
}: {
  facts: NonNullable<RetailInfo['factCards']>;
  index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!facts.length) return null;
  const visible = expanded ? facts : facts.slice(0, 6);
  return (
    <CategorySpoiler
      id="facts"
      title="Интересные факты"
      subtitle={factCardsPreview(facts)}
      meta={`${facts.length} ${pluralRu(facts.length, 'факт', 'факта', 'фактов')}`}
      icon={Lightbulb}
      index={index}
    >
      <div className="grid gap-x-7 sm:grid-cols-2">
        {visible.map((fact, index) => (
          <div key={index} className="border-b border-border py-5 first:pt-0 last:border-b-0 sm:[&:nth-child(2n+1):nth-last-child(2)]:border-b-0">
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
    </CategorySpoiler>
  );
}
