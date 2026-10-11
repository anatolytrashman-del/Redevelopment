import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { chartAxisTicks, chartDateEvery, chartShowsValues, type CombinedSearchDay } from '../../lib/siteMetrics';

function pluralDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

function dayLabel(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

function showDateLabel(index: number, count: number, every: number): boolean {
  if (index === count - 1) return true;
  if (index % every !== 0) return false;
  return count - 1 - index >= every;
}

function dateLabelStyle(index: number, count: number, slot: number): { left?: number | string; right?: number; transform?: string } {
  const pinEdges = slot < 36;
  if (pinEdges && index === 0) return { left: 0 };
  if (pinEdges && index === count - 1) return { right: 0 };
  return { left: `${((index + 0.5) / count) * 100}%`, transform: 'translateX(-50%)' };
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function SeriesChart({
  title,
  values,
  dates,
  plotHeight,
}: {
  title: string;
  values: number[];
  dates: string[];
  plotHeight: number;
}) {
  const [plotRef, plotWidth] = useElementWidth<HTMLDivElement>();
  const max = Math.max(0, ...values);
  const ticks = chartAxisTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const labelSpace = 16;
  const total = values.reduce((sum, value) => sum + value, 0);
  const every = chartDateEvery(plotWidth, dates.length);
  const showValues = chartShowsValues(plotWidth, dates.length);
  return (
    <div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Google + Яндекс · {total.toLocaleString('ru-RU')} за {dates.length} {pluralDays(dates.length)}
      </p>
      <div className="mt-3 flex">
        <div className="relative w-10 shrink-0" style={{ height: plotHeight }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-ink-faint"
              style={{ bottom: (tick / top) * (plotHeight - labelSpace) }}
            >
              {tick.toLocaleString('ru-RU')}
            </span>
          ))}
        </div>
        <div ref={plotRef} className="min-w-0 flex-1 overflow-hidden">
          <div className="relative" style={{ height: plotHeight }}>
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute right-0 left-0 border-t border-border"
                style={{ bottom: (tick / top) * (plotHeight - labelSpace) }}
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {values.map((value, index) => {
                const height = value === 0 ? 2 : Math.max(2, (value / top) * (plotHeight - labelSpace));
                const last = index === values.length - 1;
                return (
                  <div
                    key={dates[index]}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                    title={`${dayLabel(dates[index])}: ${value.toLocaleString('ru-RU')}`}
                  >
                    {showValues && (
                      <span className="relative z-10 mb-0.5 max-w-full truncate text-[10px] leading-none tabular-nums text-ink">
                        {value.toLocaleString('ru-RU')}
                      </span>
                    )}
                    <div
                      className={cn('w-[70%] max-w-6 min-w-px rounded-t-sm', last ? 'bg-primary' : 'bg-primary/60')}
                      style={{ height }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="relative mt-1.5 h-3">
            {dates.map((date, index) => (
              showDateLabel(index, dates.length, every) ? (
                <span
                  key={date}
                  className="absolute top-0 text-[10px] leading-none whitespace-nowrap text-ink-muted"
                  style={dateLabelStyle(index, dates.length, dates.length > 0 ? plotWidth / dates.length : 0)}
                >
                  {dayLabel(date)}
                </span>
              ) : null
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SearchVisibilityChart({ days, lagNote }: { days: CombinedSearchDay[]; lagNote: string | null }) {
  if (days.length === 0) return null;
  const dates = days.map((day) => day.date);
  return (
    <div className="flex flex-col gap-8">
      <SeriesChart title="Показы в поиске" values={days.map((day) => day.impressions)} dates={dates} plotHeight={280} />
      <SeriesChart title="Клики из поиска" values={days.map((day) => day.clicks)} dates={dates} plotHeight={200} />
      {lagNote && <p className="text-xs text-ink-muted">{lagNote}</p>}
    </div>
  );
}
