// Каталог арендаторов на карточке БЦ.
//
// Свод двух линий работы (2026-09-19): интерактивный каталог — поиск, фильтр,
// страницы по шесть карточек, сортировка по числу отзывов — пришёл из ветки
// preview; место в здании, ссылки на карточки источника, этажи и вынос
// оборудования — из линии Яндекс-среза.
//
// Отраслевых полос со сравнением «здание против каталога» здесь больше нет:
// владелец, посмотрев превью, сказал «разбор по отраслям вообще не нужен,
// убирай» (2026-09-19). Сама карта «рубрика → отрасль» осталась и работает —
// из неё строятся направления фильтра, и на ней же будут отраслевые хабы
// каталога (К16 в docs/bc-catalog-redesign-plan.md).
//
// Блок держим в один экран: владелец отдельно просил «сводка в одну строку,
// сегменты в выпадающий фильтр» — поэтому первым экраном остаётся ровно
// каталог, а расклад по этажам открывается по клику.
import { useEffect, useMemo, useState } from 'react';
import { Building2, Search, Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import { tenantDirectionLabel } from '../../data/tenantIndustries';
import { buildFloorGroups, formatFloorLabel, type TenantAmenity } from '../../lib/businessCenterTenants';

const TENANT_PAGE_SIZE = 6;
const ALL_TENANT_DIRECTIONS = 'Все организации';
// Оборудование и точки самообслуживания (банкоматы, кофейные автоматы) идут
// в общий каталог отдельным направлением — так их видно и можно найти
// поиском/фильтром, но не путают с обычным арендатором в других направлениях.
const AMENITY_DIRECTION = 'Оборудование';
// Этажи показываем, только когда они известны хотя бы у трети арендаторов:
// на десятке из девяноста «по этажам» — не срез здания, а случайная выборка.
const FLOOR_SUMMARY_MIN_SHARE = 0.3;

function pluralOrganizations(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'организация';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'организации';
  return 'организаций';
}

function pluralFloors(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'этаж';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'этажа';
  return 'этажей';
}

function formatCompactNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace('.', ',')} тыс.` : String(value);
}

export function TenantDirectory({
  organizations,
  amenities,
}: {
  organizations: TenantOrganizationView[];
  amenities: TenantAmenity[];
}) {
  const [query, setQuery] = useState('');
  const [activeDirection, setActiveDirection] = useState(ALL_TENANT_DIRECTIONS);
  const [page, setPage] = useState(0);
  const [floorsOpen, setFloorsOpen] = useState(false);

  const entries = useMemo(() => {
    const orgEntries = organizations.map((org) => ({ ...org, direction: tenantDirectionLabel(org.industry) }));
    const amenityEntries = amenities.map((amenity) => ({
      name: amenity.count > 1 ? `${amenity.category} (${amenity.count})` : amenity.category,
      rubric: 'Оборудование и сервисы',
      industry: null,
      placement: null,
      floor: null,
      rating: null,
      reviewCount: null,
      url: null,
      direction: AMENITY_DIRECTION,
    }));
    return [...orgEntries, ...amenityEntries];
  }, [organizations, amenities]);
  const directions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.direction, (counts.get(entry.direction) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [entries]);

  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const filtered = entries.filter((entry) => {
    const matchesDirection = activeDirection === ALL_TENANT_DIRECTIONS || entry.direction === activeDirection;
    const matchesQuery =
      !normalizedQuery ||
      `${entry.name} ${entry.rubric ?? ''}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
    return matchesDirection && matchesQuery;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / TENANT_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleEntries = filtered.slice(currentPage * TENANT_PAGE_SIZE, (currentPage + 1) * TENANT_PAGE_SIZE);

  const totalReviews = entries.reduce((sum, entry) => sum + (entry.reviewCount ?? 0), 0);
  const rated = entries.filter((entry) => entry.rating != null);
  const averageRating = rated.length > 0 ? rated.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / rated.length : null;

  const floorGroups = useMemo(() => buildFloorGroups(organizations), [organizations]);
  const withFloor = organizations.filter((org) => org.floor).length;
  const showFloors = organizations.length > 0 && withFloor / organizations.length >= FLOOR_SUMMARY_MIN_SHARE;

  useEffect(() => setPage(0), [query, activeDirection]);

  return (
    <div id="tenants" className={cn('mt-6 scroll-mt-32 overflow-hidden', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Building2 className="h-5 w-5 shrink-0 text-primary" />
            Каталог арендаторов
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
            Компании и сервисы внутри здания. Выберите направление или найдите конкретного арендатора.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-border py-3 text-sm text-ink-muted">
          <span>
            <strong className="font-semibold text-ink">{entries.length}</strong> {pluralOrganizations(entries.length)}
          </span>
          <span>
            <strong className="font-semibold text-ink">{directions.length}</strong> направлений
          </span>
          {totalReviews > 0 && (
            <span>
              <strong className="font-semibold text-ink">{formatCompactNumber(totalReviews)}</strong> отзывов
            </span>
          )}
          {averageRating != null && (
            <span>
              <strong className="font-semibold text-ink">{averageRating.toFixed(1)}</strong> средний рейтинг
            </span>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
          <label className="flex min-h-10 min-w-0 w-full items-center gap-2 rounded-xl border border-border bg-white/65 px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              type="search"
              aria-label="Поиск организаций"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти компанию или услугу"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Направление арендаторов</span>
            <select
              value={activeDirection}
              onChange={(event) => setActiveDirection(event.target.value)}
              className="min-h-10 min-w-0 w-full rounded-xl border border-border bg-white/65 px-3 text-sm font-medium text-ink outline-none focus:border-primary/40"
            >
              <option value={ALL_TENANT_DIRECTIONS}>Все организации · {entries.length}</option>
              {directions.map(([direction, count]) => (
                <option key={direction} value={direction}>
                  {direction} · {count}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visibleEntries.length > 0 ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {visibleEntries.map((entry, index) => (
              <div
                key={`${entry.name}-${entry.url ?? index}`}
                className="flex min-h-24 min-w-0 flex-col justify-between gap-2 bg-white/72 p-3.5"
              >
                <div className="min-w-0">
                  {entry.url ? (
                    // Ссылка на карточку источника: nofollow — это атрибуция,
                    // а не рекомендация.
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="block truncate text-sm font-semibold leading-snug text-ink hover:text-primary-hover hover:underline"
                      title={entry.name}
                    >
                      {entry.name}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold leading-snug text-ink" title={entry.name}>
                      {entry.name}
                    </p>
                  )}
                  <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-ink-muted" title={entry.rubric ?? undefined}>
                    {entry.rubric ?? entry.direction}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  {/* Место в здании — единственное, чего нет ни у 2GIS, ни у
                      конкурентов. Когда этаж неизвестен, строка остаётся
                      пустой: направление дублировало бы рубрику сверху. */}
                  <span className="truncate text-ink-muted">{entry.placement ?? ''}</span>
                  {entry.rating != null && (
                    <span className="flex shrink-0 items-center gap-1 font-semibold text-ink">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                      {entry.rating.toFixed(1)}
                      {entry.reviewCount != null && <span className="font-normal text-ink-muted">· {entry.reviewCount}</span>}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-muted">
            По этому запросу организаций не найдено.
          </div>
        )}

        <div className="flex justify-end text-xs text-ink-muted">
          {filtered.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="mr-1">
                {currentPage * TENANT_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * TENANT_PAGE_SIZE, filtered.length)} из{' '}
                {filtered.length}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={currentPage === 0}
                className="rounded-lg border border-border bg-white/70 px-3 py-1.5 font-semibold text-ink transition hover:border-primary/30 disabled:cursor-default disabled:opacity-35"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                disabled={currentPage >= pageCount - 1}
                className="rounded-lg border border-border bg-white/70 px-3 py-1.5 font-semibold text-ink transition hover:border-primary/30 disabled:cursor-default disabled:opacity-35"
              >
                Дальше
              </button>
            </div>
          )}
        </div>

        {/* Этажи — то, чего нет ни у 2GIS, ни у старого списка: арендатору
            важно не только «кто здесь», но и «сколько соседей на этаже».
            Под кнопкой, чтобы каталог оставался в один экран. */}
        {showFloors && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setFloorsOpen((value) => !value)}
              className="self-start text-sm font-semibold text-primary-hover hover:underline"
            >
              {floorsOpen ? 'Скрыть этажи' : `По этажам: ${floorGroups.length} ${pluralFloors(floorGroups.length)}`}
            </button>
            {floorsOpen && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {floorGroups.map((group) => (
                    <span
                      key={group.floor}
                      className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-muted"
                      title={`${formatFloorLabel(group.floor)}: ${group.count} ${pluralOrganizations(group.count)}`}
                    >
                      {formatFloorLabel(group.floor)} <span className="font-bold text-ink">{group.count}</span>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-ink-faint">
                  Этаж известен у {withFloor} из {organizations.length} организаций.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
