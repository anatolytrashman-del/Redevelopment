import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import {
  MINSK_METRO_LINES,
  METRO_WITHIN_OPTIONS,
  type CatalogFilterState,
} from '../../lib/businessCenterCatalogFilter';

// Фильтры в боковой колонке повторяют компактную структуру страницы Минск
// Мира. На мобильном те же контролы открываются в native dialog.

interface ChipProps {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

function Chip({ active, count, onClick, children, disabled }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1.5 text-left text-xs font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-white'
          : disabled
            ? 'cursor-not-allowed border-border bg-surface-muted text-ink-faint'
            : 'border-border bg-surface text-ink hover:border-primary hover:text-primary-hover',
      )}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span className={cn('text-xs font-bold tabular-nums', active ? 'text-white/80' : 'text-ink-faint')}>
          {count}
        </span>
      )}
    </button>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="shrink-0 pt-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[] | null;
  counts: Record<string, number>;
  onChange: (next: string[] | null) => void;
}

function MultiSelectDropdown({ label, options, selected, counts, onChange }: MultiSelectDropdownProps) {
  const selectedSet = useMemo(() => new Set(selected ?? options), [selected, options]);
  const summary =
    selected === null
      ? `Все (${options.length})`
      : selected.length === 0
        ? 'Ничего'
        : selected.length === 1
          ? selected[0]
          : `${selected.length} выбрано`;

  function toggle(value: string) {
    const next = new Set(selected ?? options);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === options.length ? null : options.filter((option) => next.has(option)));
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-ink marker:hidden">
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 rounded-xl border border-border bg-surface p-2 shadow-card">
          <div className="mb-2 flex gap-2 border-b border-border pb-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs font-semibold text-primary hover:text-primary-hover"
            >
              Выбрать все
            </button>
            <span className="text-ink-faint">·</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-semibold text-ink-muted hover:text-ink"
            >
              Снять все
            </button>
          </div>
          <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-xs text-ink hover:bg-surface-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(option)}
                  onChange={() => toggle(option)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">{option}</span>
                <span className="shrink-0 tabular-nums text-ink-faint">{counts[option] ?? 0}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

const metroLineDot: Record<string, string> = {
  blue: 'bg-[#1976c9]',
  red: 'bg-[#e31d35]',
  green: 'bg-[#169447]',
};

function stationKey(name: string): string {
  return name.toLocaleLowerCase('ru').replaceAll('ё', 'е');
}

interface MetroStationSelectorProps {
  stations: string[];
  selected: string[];
  counts: Record<string, number>;
  onChange: (next: string[]) => void;
}

function MetroStationSelector({ stations, selected, counts, onChange }: MetroStationSelectorProps) {
  const stationByKey = useMemo(() => new Map(stations.map((station) => [stationKey(station), station])), [stations]);
  const groupedKeys = new Set<string>();
  const groups = MINSK_METRO_LINES.map((line) => {
    const lineStations = line.stations
      .map((station) => stationByKey.get(stationKey(station)))
      .filter((station): station is string => !!station);
    lineStations.forEach((station) => groupedKeys.add(stationKey(station)));
    return { ...line, stations: lineStations };
  }).filter((line) => line.stations.length > 0);
  const other = stations.filter((station) => !groupedKeys.has(stationKey(station)));
  const summary = selected.length === 0 ? 'Любая станция' : selected.length === 1 ? selected[0] : `${selected.length} выбрано`;

  function toggle(station: string) {
    onChange(selected.includes(station) ? selected.filter((value) => value !== station) : [...selected, station]);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Станции метро</span>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-ink marker:hidden">
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 max-h-80 space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-2 shadow-card">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-semibold text-primary hover:text-primary-hover"
            >
              Снять выбор
            </button>
          )}
          {groups.map((line) => (
            <div key={line.id}>
              <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', metroLineDot[line.id])} />
                {line.label}
              </div>
              <div className="space-y-1">
                {line.stations.map((station) => (
                  <label
                    key={station}
                    className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-xs text-ink hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(station)}
                      onChange={() => toggle(station)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">{station}</span>
                    <span className="shrink-0 tabular-nums text-ink-faint">{counts[station] ?? 0}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {other.length > 0 && (
            <div>
              <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Другие</div>
              {other.map((station) => (
                <label
                  key={station}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-xs text-ink hover:bg-surface-muted"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(station)}
                    onChange={() => toggle(station)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">{station}</span>
                  <span className="shrink-0 tabular-nums text-ink-faint">{counts[station] ?? 0}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export interface CatalogFilterPanelProps {
  state: CatalogFilterState;
  onChange: (next: CatalogFilterState) => void;
  availableClasses: string[];
  districts: string[];
  microdistricts: string[];
  classCounts: Record<string, number>;
  districtCounts: Record<string, number>;
  microdistrictCounts: Record<string, number>;
  metroCounts: Record<number, number>;
  metroStations: string[];
  stationCounts: Record<string, number>;
  unverifiableCount?: number;
  resultCount: number;
  resultLabel: string;
  hasActiveFilter: boolean;
  onReset: () => void;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function CatalogFilterPanel({
  state,
  onChange,
  availableClasses,
  districts,
  microdistricts,
  classCounts,
  districtCounts,
  microdistrictCounts,
  metroCounts,
  metroStations,
  stationCounts,
  unverifiableCount = 0,
  resultCount,
  resultLabel,
  hasActiveFilter,
  onReset,
}: CatalogFilterPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setSheetOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [sheetOpen]);

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  const activeCount =
    state.classes.length +
    (state.districts === null ? 0 : 1) +
    (state.microdistricts === null ? 0 : 1) +
    state.metroStations.length +
    (state.metroWithin != null ? 1 : 0);

  const controls = (
    <div className="flex flex-col gap-4">
      <ChipRow label="Класс">
        {availableClasses.map((cls) => (
          <Chip
            key={cls}
            active={state.classes.includes(cls)}
            count={classCounts[cls] ?? 0}
            disabled={!state.classes.includes(cls) && (classCounts[cls] ?? 0) === 0}
            onClick={() => onChange({ ...state, classes: toggleInList(state.classes, cls) })}
          >
            {cls}
          </Chip>
        ))}
      </ChipRow>

      <MultiSelectDropdown
        label="Район"
        options={districts}
        selected={state.districts}
        counts={districtCounts}
        onChange={(next) => onChange({ ...state, districts: next })}
      />

      <MultiSelectDropdown
        label="Микрорайон"
        options={microdistricts}
        selected={state.microdistricts}
        counts={microdistrictCounts}
        onChange={(next) => onChange({ ...state, microdistricts: next })}
      />

      {metroStations.length > 0 && (
        <MetroStationSelector
          stations={metroStations}
          selected={state.metroStations}
          counts={stationCounts}
          onChange={(next) => onChange({ ...state, metroStations: next })}
        />
      )}

      <ChipRow label="До метро">
        {METRO_WITHIN_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={state.metroWithin === option.value}
            count={metroCounts[option.value] ?? 0}
            onClick={() =>
              onChange({ ...state, metroWithin: state.metroWithin === option.value ? null : option.value })
            }
          >
            {option.label}
          </Chip>
        ))}
      </ChipRow>

      <p className="text-xs text-ink-faint">
        Фильтры отбирают здания, по которым признак известен.
        {unverifiableCount > 0 &&
          ` По выбранному фильтру ${unverifiableCount} ${plural(unverifiableCount, 'здание', 'здания', 'зданий')} проверить невозможно: признака нет в данных prometr.by и 2ГИС — они не попадают ни в совпадения, ни в несовпадения.`}
      </p>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-expanded={sheetOpen}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink shadow-card lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Фильтры {activeCount > 0 && <span>({activeCount})</span>}
      </button>
      <div
        className={cn(
          'hidden max-h-[calc(100dvh-7rem)] space-y-5 overflow-y-auto overscroll-contain p-3 lg:block',
          glassCardClass,
        )}
        style={glassCardShadow}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Фильтры</h2>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Сбросить фильтры"
              className="rounded-full p-2 text-ink-muted hover:text-ink"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
        {controls}
      </div>

      {sheetOpen && createPortal(
        <dialog
          ref={dialogRef}
          aria-label="Фильтры каталога"
          onCancel={(event) => { event.preventDefault(); setSheetOpen(false); }}
          className="fixed inset-0 m-0 h-svh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-ink backdrop:bg-transparent lg:hidden"
        >
          <div className="absolute inset-0 bg-ink/40" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex h-svh w-80 max-w-[90vw] flex-col border-r border-white/50 bg-white/95 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="text-sm font-bold text-ink">Фильтры</span>
              <div className="flex items-center gap-2">
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-ink-muted"
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    Сбросить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Закрыть фильтры"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{controls}</div>
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="w-full rounded-full bg-primary px-4 py-3 text-sm font-bold text-white"
              >
                Показать {resultCount} {resultLabel}
              </button>
            </div>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
