import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { SearchInput } from '../ui/SearchInput';
import {
  CATALOG_FACTS,
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

// Панель фильтров каталога БЦ (К2/К3/К5/К5a плана
// docs/bc-catalog-redesign-plan.md). Решение владельца 2026-09-16: чипы
// СВЕРХУ, левой колонки фильтра не остаётся вовсе — вся ширина уходит под
// результаты. До этого фильтр был колонкой слева длиной в три экрана, где
// каждая ось сбрасывала другую, а первая карточка БЦ появлялась примерно на
// 1900-м пикселе.
//
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
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 pt-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted sm:w-20">
        {label}
      </span>
      {/* Горизонтальная прокрутка вместо переноса — на узком экране ряд
          чипов остаётся одной строкой и не съедает первый экран целиком.
          -mx-1/px-1 — чтобы обводка активного чипа не обрезалась краем
          скролл-контейнера. */}
      <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-0.5 max-sm:flex-nowrap">{children}</div>
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
  factCounts: Record<string, number>;
  /** Сколько подходит сейчас — для кнопки «Показать N» в мобильной шторке. */
  resultCount: number;
  resultLabel: string;
  /** Скрыть тумблер, дублирующий ось самого маршрута (например «Строится» на хабе строящихся). */
  hiddenFactIds?: string[];
  hasActiveFilter: boolean;
  onReset: () => void;
}

const VISIBLE_FACTS = 6;

export function CatalogFilterPanel({
  state,
  onChange,
  availableClasses,
  districts,
  classCounts,
  districtCounts,
  metroCounts,
  factCounts,
  resultCount,
  resultLabel,
  hiddenFactIds = [],
  hasActiveFilter,
  onReset,
}: CatalogFilterPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [factsExpanded, setFactsExpanded] = useState(false);

  const facts = CATALOG_FACTS.filter((f) => !hiddenFactIds.includes(f.id));
  const shownFacts = factsExpanded ? facts : facts.slice(0, VISIBLE_FACTS);

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const activeCount =
    state.classes.length +
    state.districts.length +
    state.facts.length +
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

      <ChipRow label="Что внутри">
        {shownFacts.map((f) => (
          <Chip
            key={f.id}
            active={state.facts.includes(f.id)}
            count={factCounts[f.id] ?? 0}
            disabled={!state.facts.includes(f.id) && (factCounts[f.id] ?? 0) === 0}
            onClick={() => onChange({ ...state, facts: toggleInList(state.facts, f.id) })}
          >
            {f.label}
          </Chip>
        ))}
        {facts.length > VISIBLE_FACTS && (
          <button
            type="button"
            onClick={() => setFactsExpanded((v) => !v)}
            className="shrink-0 rounded-full px-2 py-1.5 text-sm font-semibold text-primary-hover hover:underline"
          >
            {factsExpanded ? 'Свернуть' : `Ещё ${facts.length - VISIBLE_FACTS}`}
          </button>
        )}
      </ChipRow>

      {/* Честная оговорка вместо молчания: у части зданий параметра нет в
          источнике, и тумблер их не покажет — это «неизвестно», а не «нет»
          (см. комментарий у CATALOG_FACTS). */}
      <p className="text-xs text-ink-faint">
        Тумблеры отбирают здания, по которым параметр известен: у части БЦ его нет в данных
        prometr.by и 2ГИС — такие в выборку не попадают.
      </p>
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-4 p-4 sm:p-5', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
          placeholder="Название, улица, микрорайон, станция метро"
          wrapperClassName="min-w-0 flex-1 basis-full sm:basis-56"
          aria-label="Поиск по бизнес-центрам"
        />

        {/* Переключатель вида (К6). Стоит рядом с сортировкой, а не над
            результатами: это одна и та же мысль — «как показать то, что
            отобрано». */}
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface p-1">
          {CATALOG_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onChange({ ...state, view: v.key as CatalogView })}
              aria-pressed={state.view === v.key}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                state.view === v.key ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <label className="relative flex shrink-0 items-center">
          <span className="sr-only">Сортировка</span>
          <select
            value={state.sort}
            onChange={(e) => onChange({ ...state, sort: e.target.value as CatalogSortKey })}
            className="appearance-none rounded-full border border-border bg-surface py-2.5 pl-4 pr-9 text-sm font-semibold text-ink outline-none focus:border-primary"
          >
            {CATALOG_SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ink-muted" />
        </label>

        {/* Ниже lg панель схлопнута в одну кнопку — шторка снизу с «Показать
            N» (К5a): на телефоне четыре ряда чипов заняли бы весь первый
            экран, ради которого всё и переделывалось. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors lg:hidden',
            activeCount > 0 ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-ink',
          )}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          Фильтры
          {activeCount > 0 && <span className="text-xs font-bold tabular-nums">{activeCount}</span>}
        </button>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={onReset}
            className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink lg:flex"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            Сбросить
          </button>
        )}
      </div>

      <div className="hidden lg:block">{controls}</div>

      {/* Шторка уходит ПОРТАЛОМ в body: у стеклянной карточки вокруг —
          backdrop-blur, а он создаёт содержащий блок для position:fixed, и
          «шторка снизу» прилипала к верху карточки, накрывая шапку сайта
          вместо нижнего края экрана. */}
      {sheetOpen && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85svh] flex-col rounded-t-3xl border-t border-white/50 bg-white/95 backdrop-blur-xl">
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
            <div className="flex-1 overflow-y-auto px-4 py-4">{controls}</div>
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
        </div>,
        document.body,
      )}
    </div>
  );
}
