// Бизнес-карточки ТЦ без сносок на источники (владелец, 2026-09-25).
import {
  Quote,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import type {
  RetailQuoteEntry,
} from '../../data/businessCenters';
import {
  formatRetailDate,
  quoteText,
} from '../../lib/tradeCenterRetail';
import { RetailCardTitle } from './TradeCenterRetailParts';
import { retailCardClass } from './tradeCenterRetailStyle';

export function TradeCenterQuotesCard({ quotes }: { quotes: RetailQuoteEntry[] }) {
  return (
    <div id="quotes" className={retailCardClass} style={glassCardShadow}>
      <RetailCardTitle id="quotes" />
      <div className={cn('grid grid-cols-1 gap-3', quotes.length > 1 && 'md:grid-cols-2')}>
        {quotes.map((q, i) => {
          const when = formatRetailDate(q.date);
          const text = quoteText(q);
          return (
            <figure key={i} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-white/65 p-4">
              <Quote className="h-4 w-4 shrink-0 text-primary/50" aria-hidden="true" />
              <blockquote className="break-words text-sm leading-relaxed text-ink">{text}</blockquote>
              <figcaption className="mt-auto break-words text-xs text-ink-muted">
                — {q.who}
                {when && <span className="text-ink-faint">, {when}</span>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
