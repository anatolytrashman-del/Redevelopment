// Бизнес-карточки ТЦ без сносок на источники (владелец, 2026-09-25).
import { Quote } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { RetailQuoteEntry } from '../../data/businessCenters';
import { formatRetailDate, quoteText } from '../../lib/tradeCenterRetail';
import { RetailCategorySpoiler } from './RetailCategorySpoiler';
import { pluralRu } from '../../lib/pluralRu';

export function TradeCenterQuotesCard({ quotes, index }: { quotes: RetailQuoteEntry[]; index?: number }) {
  const preview = quotes.slice(0, 2).map((q) => q.who.trim()).filter(Boolean).join(' · ')
    || 'Что говорили о ТЦ управляющие и СМИ';
  return (
    <RetailCategorySpoiler
      id="quotes"
      subtitle={preview}
      meta={`${quotes.length} ${pluralRu(quotes.length, 'цитата', 'цитаты', 'цитат')}`}
      index={index}
    >
      <div className={cn('grid grid-cols-1 gap-3', quotes.length > 1 && 'md:grid-cols-2')}>
        {quotes.map((q, i) => {
          const when = formatRetailDate(q.date);
          const text = quoteText(q);
          return (
            <figure key={i} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-white/65 p-4">
              <Quote className="h-4 w-4 shrink-0 text-ink/40" strokeWidth={1.75} aria-hidden="true" />
              <blockquote className="break-words text-sm leading-relaxed text-ink">{text}</blockquote>
              <figcaption className="mt-auto break-words text-xs text-ink-muted">
                — {q.who}
                {when && <span className="text-ink-faint">, {when}</span>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </RetailCategorySpoiler>
  );
}
