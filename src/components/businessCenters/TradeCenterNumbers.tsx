import { useId, useState } from 'react';
import { ArrowUpDown, Building2, Car, Flag, HardHat, Monitor, PanelsTopLeft, Sparkles } from 'lucide-react';
import type { RetailFigureEntry } from '../../data/businessCenters';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import { groupNumbers, holidayDate, numberFormat, numberIcon } from '../../lib/tradeCenterNumbers';
import { RetailCardTitle } from './TradeCenterRetailParts';
import { retailCardClass } from './tradeCenterRetailStyle';
import { balancedColumns, fitGridClass } from '../../lib/fitGrid';

const icons = { ArrowUpDown, Building2, Car, Flag, HardHat, Monitor, PanelsTopLeft, Sparkles };

function NumberTile({ entry, wide }: { entry: RetailFigureEntry; wide: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const Icon = icons[numberIcon(entry)];
  return <button type="button" aria-expanded={open} aria-controls={entry.text ? id : undefined}
    onClick={() => { if (entry.text) setOpen(!open); }}
    className={cn('min-w-0 rounded-[18px] border bg-white p-4 text-left text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', open ? 'border-primary' : 'border-border', entry.text && 'cursor-pointer hover:border-ink-faint')}>
    {/* Плиток мало и они широкие — иконка слева, а не над цифрой: иначе
        в плитке остаётся пустое поле справа. */}
    <span className={cn('block', wide && 'sm:flex sm:items-start sm:gap-3.5')}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-icon-bg text-icon', wide ? 'mb-3 sm:mb-0' : 'mb-3')}><Icon className="h-[19px] w-[19px]" aria-hidden="true" /></span>
      <span className="block min-w-0">
        <span className="block break-words text-2xl font-extrabold leading-none tabular-nums">{entry.value}</span>
        <span className="mt-1.5 block break-words text-xs leading-snug text-ink-muted">{entry.label}</span>
      </span>
    </span>
    {entry.text && <span id={id} hidden={!open} className={cn('mt-2.5 break-words border-t border-dashed border-border pt-2 text-xs leading-relaxed', open ? 'block' : 'hidden')}>{entry.text}</span>}
  </button>;
}

function ScaleNumber({ entry }: { entry: RetailFigureEntry }) {
  const format = numberFormat(entry);
  return <div className="min-w-0 rounded-[22px] border border-border bg-white px-5 py-5 sm:px-[22px]">
    <p className="break-words text-4xl font-extrabold leading-none tracking-tight text-ink tabular-nums">{entry.value}</p>
    <p className="mt-1.5 break-words text-[15px] font-bold text-ink">{entry.label}</p>
    {format.kind === 'comparison' && <div className="mt-4 grid gap-2">
      {[{ label: entry.label, value: entry.value, ratio: 1 }, format].map((bar, index) => <div key={index} className="grid grid-cols-[minmax(0,1.4fr)_minmax(30px,1fr)_auto] items-center gap-2 text-xs text-ink-muted">
        <span className="break-words">{bar.label}</span>
        <span className="h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true"><span className={cn('block h-full rounded-full', index === 0 ? 'bg-[#3b3d44]' : 'bg-ink-faint')} style={{ width: `${bar.ratio * 100}%` }} /></span>
        <span className="text-right font-bold text-ink tabular-nums">{bar.value}</span>
      </div>)}
    </div>}
    {format.kind === 'fields' && <>
      <div className="mt-3.5 flex flex-wrap gap-1" aria-hidden="true">{Array.from({ length: format.count }, (_, index) => <span key={index} className="relative h-[17px] w-[26px] rounded-[3px] bg-success after:absolute after:inset-y-0.5 after:left-1/2 after:border-l after:border-white/60" />)}</div>
      <p className="mt-2 text-xs text-ink-muted">{format.caption}</p>
    </>}
    {format.kind === 'plain' && format.text && <p className="mt-3 text-xs leading-relaxed text-ink-muted">{format.text}</p>}
  </div>;
}

// Левая граница плитки праздника — только между колонками одного ряда.
const HOLIDAY_COLUMNS: Record<number, string> = {
  1: 'md:[&>*]:border-l-0',
  2: 'md:grid-cols-2 md:[&>*:nth-child(2n+1)]:border-l-0',
  3: 'md:grid-cols-3 md:[&>*:nth-child(3n+1)]:border-l-0',
};

// Разные форматы отделяют главные цифры от деталей (владелец, 2026-09-25).
export function TradeCenterNumbersCard({ numbers }: { numbers: RetailFigureEntry[] }) {
  const groups = groupNumbers(numbers);
  if (!groups.length) return null;
  return <section id="numbers" className={retailCardClass} style={glassCardShadow}>
    <RetailCardTitle id="numbers" />
    {groups.map((group) => <div key={group.kind}>
      {group.label && <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">{group.label}</h3>}
      {group.kind === 'scale' && <div className={cn('grid gap-3.5', fitGridClass(group.entries.length, 2))}>{group.entries.map((entry, index) => <ScaleNumber key={`${entry.label}-${index}`} entry={entry} />)}</div>}
      {group.kind === 'building' && <div className={cn('grid items-start gap-2.5', fitGridClass(group.entries.length, 5, 'tiles'))}>{group.entries.map((entry, index) => <NumberTile key={`${entry.label}-${entry.value}-${index}`} entry={entry} wide={balancedColumns(group.entries.length, 5) <= 3} />)}</div>}
      {group.kind === 'holidays' && <div className={cn('grid grid-cols-1 overflow-hidden rounded-[22px] bg-[#1b1c20] text-white', HOLIDAY_COLUMNS[balancedColumns(group.entries.length, 3)])}>
        {group.entries.map((entry, index) => <div key={`${entry.label}-${index}`} className="min-w-0 border-white/10 px-5 py-[18px] max-md:border-t max-md:first:border-t-0 md:border-l">
          {holidayDate(entry) && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">{holidayDate(entry)}</p>}
          <p className="break-words text-[28px] font-extrabold leading-none tabular-nums">{entry.value}</p>
          <p className="mt-1.5 break-words text-xs leading-snug text-white/65">{entry.label}</p>
        </div>)}
      </div>}
    </div>)}
  </section>;
}
