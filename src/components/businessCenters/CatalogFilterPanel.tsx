import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { SearchInput } from '../ui/SearchInput';
import {
  CATALOG_PRESETS,
  CATALOG_SORTS,
  CATALOG_VIEWS,
  EMPTY_CATALOG_FILTER,
  METRO_WITHIN_OPTIONS,
  isPresetActive,
  type CatalogFilterState,
  type CatalogSortKey,
  type CatalogView,
} from '../../lib/businessCenterCatalogFilter';

// Фильтры в боковой колонке, как оглавление Минск Мира (владелец, 2026-09-17).
// Все оси и счётчики сохранены; на мобильном — выдвижная панель.
// Панель ничего не знает про маршруты и SEO-хабы: она отдаёт наружу новое
// состояние через onChange, а страница уже решает, превратить его в
// красивый URL хаба или в query-параметры (см. businessCenterCatalogFilter.ts
// и urlForFilter в BusinessCentersMinskPage.tsx).

interface ChipProps {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
  // Чип, который при count === 0 не исчезает, а гаснет: пропадающие на
  // глазах варианты мешают понять, что вообще можно выбрать (и куда делся
  // тот, по которому пользователь только что целился).
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

export interface CatalogFilterPanelProps {
  state: CatalogFilterState;
  onChange: (next: CatalogFilterState) => void;
  availableClasses: string[];
  districts: string[];
  /** Сколько БЦ останется, если выбрать именно это значение (остальные фильтры как есть). */
  classCounts: Record<string, number>;
  districtCounts: Record<string, number>;
  metroCounts: Record<number, number>;
  /** Станции метро, встречающиеся у зданий каталога (по алфавиту). */
  metroStations: string[];
  stationCounts: Record<string, number>;
  /** Сколько зданий нельзя проверить по применённому фильтру: признака нет в данных. */
  unverifiableCount?: number;
  /** Сколько подходит сейчас — для кнопки «Показать N» в мобильной шторке. */
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
  classCounts,
  districtCounts,
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
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const activeCount =
    state.classes.length +
    state.districts.length +
    state.metroStations.length +
      (state.metroWithin != null ? 1 : 0) +
    (state.query ? 1 : 0);

  const controls = (
    <div className="flex flex-col gap-3">
      {/* К15: готовые подборки — ответы на то, что люди спрашивают словами,
          а не осями фильтра. Клик ставит состояние целиком, повторный клик
          снимает; сортировка и вид при этом не трогаются — переключать
          подборку, теряя выбранную таблицу, было бы обидно. */}
      <ChipRow label="Подборки">
        {CATALOG_PRESETS.map((preset) => {
          const active = isPresetActive(preset, state);
          return (
            <Chip
              key={preset.id}
              active={active}
              onClick={() =>
                onChange(
                  active
                    ? { ...EMPTY_CATALOG_FILTER, sort: state.sort, view: state.view }
                    : { ...EMPTY_CATALOG_FILTER, ...preset.patch, sort: state.sort, view: state.view },
                )
              }
            >
              {preset.label}
            </Chip>
          );
        })}
      </ChipRow>

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

      <ChipRow label="Район">
        {districts.map((d) => (
          <Chip
            key={d}
            active={state.districts.includes(d)}
            count={districtCounts[d] ?? 0}
            disabled={!state.districts.includes(d) && (districtCounts[d] ?? 0) === 0}
            onClick={() => onChange({ ...state, districts: toggleInList(state.districts, d) })}
          >
            {d}
          </Chip>
        ))}
      </ChipRow>

      {/* Станция метро — множественный выбор (владелец, 2026-09-17).
          Раньше конкретную станцию можно было найти только строкой поиска
          или через её SEO-хаб, то есть «рядом с Уручьем ИЛИ с Борисовским
          трактом» не выражалось никак. */}
      {metroStations.length > 0 && (
        <ChipRow label="Станция метро">
          {metroStations.map((st) => (
            <Chip
              key={st}
              active={state.metroStations.includes(st)}
              count={stationCounts[st] ?? 0}
              disabled={!state.metroStations.includes(st) && (stationCounts[st] ?? 0) === 0}
              onClick={() => onChange({ ...state, metroStations: toggleInList(state.metroStations, st) })}
            >
              {st}
            </Chip>
          ))}
        </ChipRow>
      )}

      {/* Метро — расстояние, а не перебор 32 станций: «хочу рядом с метро,
          всё равно с какой» раньше не выражалось вовсе. Конкретная станция
          — через строку поиска или её собственный SEO-хаб. */}
      <ChipRow label="До метро">
        {METRO_WITHIN_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            active={state.metroWithin === o.value}
            count={metroCounts[o.value] ?? 0}
            onClick={() => onChange({ ...state, metroWithin: state.metroWithin === o.value ? null : o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </ChipRow>

      {/* Честная оговорка вместо молчания: у части зданий параметра нет в
          источнике, и тумблер их не покажет — это «неизвестно», а не «нет»
          (см. комментарий у CATALOG_FACTS). */}
      <p className="text-xs text-ink-faint">
        Фильтры отбирают здания, по которым признак известен.
        {unverifiableCount > 0 &&
          ` По выбранному фильтру ${unverifiableCount} ${plural(unverifiableCount, 'здание', 'здания', 'зданий')} проверить невозможно: признака нет в данных prometr.by и 2ГИС — они не попадают ни в совпадения, ни в несовпадения.`}
      </p>
    </div>
  );

  const toolbar = (
      <div className="flex min-w-0 flex-col gap-3">
        <SearchInput
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
          placeholder="Название, адрес, метро"
          wrapperClassName="w-full min-w-0"
          aria-label="Поиск по бизнес-центрам"
        />

        {/* Переключатель вида (К6). Стоит рядом с сортировкой, а не над
            результатами: это одна и та же мысль — «как показать то, что
            отобрано». */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          {CATALOG_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onChange({ ...state, view: v.key as CatalogView })}
              aria-pressed={state.view === v.key}
              className={cn(
                'flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors',
                state.view === v.key ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <label className="relative flex min-w-0 items-center">
          <span className="sr-only">Сортировка</span>
          <select
            value={state.sort}
            onChange={(e) => onChange({ ...state, sort: e.target.value as CatalogSortKey })}
            className="w-full min-w-0 appearance-none rounded-full border border-border bg-surface py-2.5 pl-4 pr-9 text-xs font-semibold text-ink outline-none focus:border-primary"
          >
            {CATALOG_SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ink-muted" />
        </label>

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
        className={cn('hidden max-h-[calc(100dvh-7rem)] space-y-5 overflow-y-auto overscroll-contain p-3 lg:block', glassCardClass)}
        style={glassCardShadow}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Фильтры</h2>
          {hasActiveFilter && (
            <button type="button" onClick={onReset} aria-label="Сбросить фильтры" className="rounded-full p-2 text-ink-muted hover:text-ink">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
        {toolbar}
        {controls}
      </div>

      {/* Портал и native dialog: фокус остаётся в фильтрах, Escape закрывает панель. */}
      {sheetOpen && createPortal(
        <dialog
          ref={dialogRef}
          aria-label="Фильтры каталога"
          onCancel={(event) => { event.preventDefault(); setSheetOpen(false); }}
          className="fixed inset-0 m-0 h-svh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-ink backdrop:bg-transparent lg:hidden"
        >
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
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
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">{toolbar}{controls}</div>
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
