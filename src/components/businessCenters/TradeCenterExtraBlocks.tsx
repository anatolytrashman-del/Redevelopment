// Бизнес-карточки ТЦ без сносок на источники (владелец, 2026-09-25).
import {
  Quote,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import type {
  RetailFigureEntry,
  RetailQuoteEntry,
} from '../../data/businessCenters';
import {
  formatRetailDate,
  quoteText,
} from '../../lib/tradeCenterRetail';
import { RetailCardTitle } from './TradeCenterRetailParts';
import { retailCardClass } from './tradeCenterRetailStyle';

// Плитка «ТЦ в цифрах»: крупная цифра, подпись и фраза, почему это
// впечатляет (владелец, 2026-09-24: «что-то яркое и интересное людям»).
function NumberTile({ entry, hero }: { entry: RetailFigureEntry; hero: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-2xl p-4',
        hero ? 'bg-primary/[0.06] sm:p-5' : 'border border-border bg-white/65',
      )}
    >
      <span
        className={cn(
          'break-words font-bold leading-none tracking-tight text-primary tabular-nums',
          hero ? 'text-3xl sm:text-4xl' : 'text-2xl',
        )}
      >
        {entry.value}
      </span>
      <span className="break-words text-sm font-semibold leading-snug text-ink">{entry.label}</span>
      {entry.text && <span className="break-words text-xs leading-relaxed text-ink-muted">{entry.text}</span>}
    </div>
  );
}

export function TradeCenterNumbersCard({ numbers }: { numbers: RetailFigureEntry[] }) {
  const hero = numbers.slice(0, 2);
  const rest = numbers.slice(2);
  return (
    <div id="numbers" className={retailCardClass} style={glassCardShadow}>
      <RetailCardTitle id="numbers" />
      <div className={cn('grid grid-cols-1 gap-2.5', hero.length > 1 && 'sm:grid-cols-2')}>
        {hero.map((n, i) => (
          <NumberTile key={`${n.label}-${i}`} entry={n} hero />
        ))}
      </div>
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((n, i) => (
            <NumberTile key={`${n.label}-${i}`} entry={n} hero={false} />
          ))}
        </div>
      )}
    </div>
  );
}

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
