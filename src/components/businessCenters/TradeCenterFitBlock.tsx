// Сравнение с аналогами — сразу под hero: две колонки win/lose, только
// факты карточки. Визуал «счёта» (плюсы / минусы), не сплошной текст.
import { Check, Scale, X } from 'lucide-react';
import { CategorySpoiler } from '../ui/CategorySpoiler';
import { cn } from '../../lib/cn';
import type { TcFitPoint } from '../../lib/tradeCenterHero';

function FitColumn({
  side,
  points,
}: {
  side: 'win' | 'lose';
  points: TcFitPoint[];
}) {
  const win = side === 'win';
  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border p-4 sm:p-5',
        win
          ? 'border-emerald-200/90 bg-emerald-50/70'
          : 'border-stone-200 bg-stone-50/80',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          className={cn(
            'text-sm font-extrabold tracking-tight sm:text-base',
            win ? 'text-emerald-900' : 'text-stone-700',
          )}
        >
          {win ? 'Сильнее аналогов' : 'Слабее аналогов'}
        </h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold tabular-nums',
            win ? 'bg-emerald-600/12 text-emerald-800' : 'bg-stone-500/12 text-stone-600',
          )}
        >
          {points.length}
        </span>
      </div>
      <ul className="mt-3.5 flex flex-col gap-3">
        {points.map((point) => (
          <li key={point.text} className="flex gap-3 text-sm leading-snug text-ink">
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                win ? 'bg-emerald-600 text-white' : 'bg-stone-400 text-white',
              )}
              aria-hidden="true"
            >
              {win ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
              ) : (
                <X className="h-3.5 w-3.5" strokeWidth={2.75} />
              )}
            </span>
            <span className={cn('pt-0.5', !win && 'text-ink/85')}>{point.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
<<<<<<< HEAD
  const previewParts = [
    wins[0]?.text ?? null,
    loses[0]?.text ?? null,
  ].filter(Boolean);
  const preview = previewParts.length
    ? previewParts.join(' · ')
    : wins.length && loses.length
      ? `${wins.length} плюс · ${loses.length} минус к аналогам`
      : null;
=======
  const preview =
    wins.length && loses.length
      ? `${wins.length} сильнее · ${loses.length} слабее`
      : wins.length > 0
        ? `Сильнее аналогов в ${wins.length}`
        : `Слабее аналогов в ${loses.length}`;
>>>>>>> origin/claude/redevelopment-platform-prototype-oodobu

  return (
    <CategorySpoiler
      id="tc-fit"
      title="Сравнение с аналогами"
      subtitle={preview}
<<<<<<< HEAD
      meta={[wins.length ? `+${wins.length}` : null, loses.length ? `−${loses.length}` : null].filter(Boolean).join(' · ') || 'Выигрывает · проигрывает'}
=======
      meta={`${wins.length}↑ · ${loses.length}↓`}
>>>>>>> origin/claude/redevelopment-platform-prototype-oodobu
      icon={Scale}
      index={index}
      defaultOpen
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-ink-muted">
          Коротко: в чём этот ТЦ выигрывает у типичных аналогов в городе — и где
          проигрывает. Только из фактов карточки, без оценок «на глаз».
        </p>
        <div className={cn('grid gap-3', wins.length > 0 && loses.length > 0 && 'md:grid-cols-2')}>
          {wins.length > 0 && <FitColumn side="win" points={wins} />}
          {loses.length > 0 && <FitColumn side="lose" points={loses} />}
        </div>
      </div>
    </CategorySpoiler>
  );
}
