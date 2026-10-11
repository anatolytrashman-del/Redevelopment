// Сравнение с аналогами — формат win/lose как на casinolist «кому подойдёт»:
// в чём ТЦ выигрывает и проигрывает, только из фактов карточки.
import { Check, Scale, X } from 'lucide-react';
import { CategorySpoiler } from '../ui/CategorySpoiler';
import { tcChipSoftClass } from './tradeCenterRetailStyle';
import { cn } from '../../lib/cn';
import type { TcFitPoint } from '../../lib/tradeCenterHero';

export function TradeCenterFitBlock({
  points,
  index,
}: {
  points: TcFitPoint[];
  index?: number;
}) {
  if (points.length === 0) return null;
  const wins = points.filter((p) => p.side === 'win');
  const loses = points.filter((p) => p.side === 'lose');
  const previewParts = [
    wins[0]?.text ?? null,
    loses[0]?.text ?? null,
  ].filter(Boolean);
  const preview = previewParts.length
    ? previewParts.join(' · ')
    : wins.length && loses.length
      ? `${wins.length} плюс · ${loses.length} минус к аналогам`
      : null;

  return (
    <CategorySpoiler
      id="tc-fit"
      title="Сравнение с аналогами"
      subtitle={preview}
      meta={[wins.length ? `+${wins.length}` : null, loses.length ? `−${loses.length}` : null].filter(Boolean).join(' · ') || 'Выигрывает · проигрывает'}
      icon={Scale}
      index={index}
      defaultOpen
    >
      <div className={cn('grid gap-3', wins.length > 0 && loses.length > 0 && 'md:grid-cols-2')}>
        {wins.length > 0 && (
          <div className="rounded-2xl border border-[#efdfd4] bg-[#fff8f2]/80 p-4">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#c45c3a]/80">
              Выигрывает у аналогов
            </h3>
            <ul className="mt-2.5 flex flex-col gap-2">
              {wins.map((point) => (
                <li key={point.text} className="flex gap-2.5 text-sm leading-snug text-ink">
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg', tcChipSoftClass)}>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <span>{point.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {loses.length > 0 && (
          <div className="rounded-2xl border border-border bg-white/80 p-4">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">
              Проигрывает аналогам
            </h3>
            <ul className="mt-2.5 flex flex-col gap-2">
              {loses.map((point) => (
                <li key={point.text} className="flex gap-2.5 text-sm leading-snug text-ink/80">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink/50">
                    <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <span>{point.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CategorySpoiler>
  );
}
