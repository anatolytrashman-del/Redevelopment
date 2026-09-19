// Каталог арендаторов на карточке БЦ.
//
// Свод двух линий работы (2026-09-19): интерактивный каталог — поиск, фильтр,
// страницы по шесть карточек, сортировка по числу отзывов — пришёл из ветки
// preview; отраслевой разбор со сравнением «здание против каталога», этажи,
// ссылки на карточки источника и вынос оборудования — из линии Яндекс-среза.
//
// Почему разбор спрятан под кнопку, а не развёрнут: владелец, посмотрев
// превью, просил уплотнить блок до одного экрана («сводка в одну строку,
// сегменты в выпадающий фильтр, отдельная диаграмма убрана») — поэтому первым
// экраном остаётся ровно каталог, а полосы отраслей и этажи открываются по
// клику. Данные при этом никуда не делись и целиком описаны в FAQ страницы.
import { useEffect, useMemo, useState } from 'react';
import { Building2, Search, Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { TenantIndustryCityProfile } from '../../data/businessCenter2gis';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import { TENANT_INDUSTRY_OTHER, tenantDirectionLabel, tenantIndustryLabel } from '../../data/tenantIndustries';
import { buildFloorGroups, formatFloorLabel, type TenantAmenity } from '../../lib/businessCenterTenants';

const TENANT_PAGE_SIZE = 6;
const ALL_TENANT_DIRECTIONS = 'Все организации';
// Сколько полос отраслей показывать в развёрнутом разборе до кнопки «ещё».
const VISIBLE_INDUSTRIES = 8;
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

function pluralIndustries(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отрасль';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'отрасли';
  return 'отраслей';
}

function formatCompactNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace('.', ',')} тыс.` : String(value);
}

interface IndustryRow {
  industry: string;
  label: string;
  count: number;
  share: number;
  cityShare: number | null;
}

function buildIndustryRows(
  organizations: TenantOrganizationView[],
  cityProfile: TenantIndustryCityProfile | null,
): IndustryRow[] {
  const byIndustry = new Map<string, number>();
  for (const org of organizations) {
    const industry = org.industry ?? TENANT_INDUSTRY_OTHER;
    byIndustry.set(industry, (byIndustry.get(industry) ?? 0) + 1);
  }

  const cityTotal = cityProfile?.orgTotal ?? 0;
  const cityByIndustry = new Map(cityProfile?.industries.map((item) => [item.industry, item.orgCount]) ?? []);

  return Array.from(byIndustry.entries())
    .map(([industry, count]) => ({
      industry,
      label: tenantIndustryLabel(industry === TENANT_INDUSTRY_OTHER ? null : industry),
      count,
      share: count / organizations.length,
      cityShare: cityTotal > 0 ? (cityByIndustry.get(industry) ?? 0) / cityTotal : null,
    }))
    .sort((a, b) => {
      // «Другое» — всегда последним: это не отрасль, а остаток. У яндексовской
      // базы он крупный и честный — 871 организация из 7608 сидит в рубрике
      // «Офис организации», про которую источник не говорит больше ничего.
      if (a.industry === TENANT_INDUSTRY_OTHER) return 1;
      if (b.industry === TENANT_INDUSTRY_OTHER) return -1;
      return b.count - a.count || a.label.localeCompare(b.label, 'ru');
    });
}

function formatDelta(share: number, cityShare: number): string | null {
  const delta = Math.round((share - cityShare) * 100);
  // Меньше 2 п.п. — шум на выборке в полсотни организаций, такую разницу не
  // показываем вовсе, чтобы не читалась как вывод.
  if (Math.abs(delta) < 2) return null;
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} п.п. к городу`;
}

export function TenantDirectory({
  organizations,
  amenities,
  cityProfile,
  source,
  capturedAt,
  reportedTotal,
}: {
  organizations: TenantOrganizationView[];
  amenities: TenantAmenity[];
  cityProfile: TenantIndustryCityProfile | null;
  source: 'yandex_maps' | '2gis';
  capturedAt: string | null;
  reportedTotal: number | null;
}) {
  const [query, setQuery] = useState('');
  const [activeDirection, setActiveDirection] = useState(ALL_TENANT_DIRECTIONS);
  const [page, setPage] = useState(0);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [industriesExpanded, setIndustriesExpanded] = useState(false);

  const entries = useMemo(
    () => organizations.map((org) => ({ ...org, direction: tenantDirectionLabel(org.industry) })),
    [organizations],
  );
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

  const industryRows = useMemo(() => buildIndustryRows(organizations, cityProfile), [organizations, cityProfile]);
  const visibleRows = industriesExpanded ? industryRows : industryRows.slice(0, VISIBLE_INDUSTRIES);
  const hiddenRows = industryRows.length - visibleRows.length;
  const floorGroups = useMemo(() => buildFloorGroups(organizations), [organizations]);
  const withFloor = organizations.filter((org) => org.floor).length;
  const showFloors = organizations.length > 0 && withFloor / organizations.length >= FLOOR_SUMMARY_MIN_SHARE;
  // Шкала общая для полосы здания и метки города, иначе метка врёт: рисуем её
  // от максимума из обоих значений, а не от 100% — при двух десятках отраслей
  // самая крупная редко занимает больше четверти.
  const scale = Math.max(...visibleRows.map((row) => Math.max(row.share, row.cityShare ?? 0)), 0.01);
  const partial = reportedTotal != null && reportedTotal > organizations.length;

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
          <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-border bg-white/65 px-3">
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
              className="min-h-10 w-full rounded-xl border border-border bg-white/65 px-3 text-sm font-medium text-ink outline-none focus:border-primary/40"
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
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border xl:grid-cols-3">
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

        <button
          type="button"
          onClick={() => setBreakdownOpen((value) => !value)}
          className="self-start text-sm font-semibold text-primary-hover hover:underline"
        >
          {breakdownOpen ? 'Скрыть разбор' : `Разбор: ${industryRows.length} ${pluralIndustries(industryRows.length)}${showFloors ? ' и этажи' : ''}`}
        </button>

        {breakdownOpen && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {visibleRows.map((row) => {
                const width = Math.max(2, Math.round((row.share / scale) * 100));
                const cityLeft = row.cityShare != null ? Math.min(100, Math.round((row.cityShare / scale) * 100)) : null;
                const delta = row.cityShare != null ? formatDelta(row.share, row.cityShare) : null;
                return (
                  <div
                    key={row.industry}
                    className="flex items-center gap-3"
                    title={
                      row.cityShare != null
                        ? `${row.label}: ${row.count} из ${organizations.length} (${Math.round(row.share * 100)}%). По каталогу — ${Math.round(row.cityShare * 100)}%`
                        : `${row.label}: ${row.count} из ${organizations.length} (${Math.round(row.share * 100)}%)`
                    }
                  >
                    <span className="w-28 shrink-0 text-xs text-ink-muted sm:w-52">{row.label}</span>
                    <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full bg-ink-muted" style={{ width: `${width}%` }} />
                      {cityLeft != null && (
                        // Метка города — тонкая риска поверх полосы, с зазором
                        // в цвет подложки по бокам, чтобы не слипалась.
                        <span
                          className="absolute inset-y-0 w-0.5 rounded-full bg-primary ring-2 ring-surface-muted"
                          style={{ left: `calc(${cityLeft}% - 1px)` }}
                        />
                      )}
                    </span>
                    <span className="w-32 shrink-0 text-right text-xs tabular-nums sm:w-40">
                      <span className="font-bold text-ink">{Math.round(row.share * 100)}%</span>{' '}
                      <span className="text-ink-muted">({row.count})</span>
                      {delta && <span className="block text-ink-faint">{delta}</span>}
                    </span>
                  </div>
                );
              })}
            </div>

            {industryRows.length > VISIBLE_INDUSTRIES && (
              <button
                type="button"
                onClick={() => setIndustriesExpanded((value) => !value)}
                className="self-start text-sm font-semibold text-primary-hover hover:underline"
              >
                {industriesExpanded ? 'Свернуть отрасли' : `Показать ещё ${hiddenRows} ${pluralIndustries(hiddenRows)}`}
              </button>
            )}

            {cityProfile && cityProfile.orgTotal > 0 && (
              <p className="flex items-center gap-2 text-xs text-ink-faint">
                <span className="inline-block h-3 w-0.5 shrink-0 rounded-full bg-primary" />
                доля этой отрасли в среднем по {cityProfile.buildingTotal} зданиям каталога
              </p>
            )}

            {/* Этажи — то, чего нет ни у 2GIS, ни у старого списка: арендатору
                важно не только «кто здесь», но и «сколько соседей на этаже». */}
            {showFloors && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">По этажам</p>
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
              </div>
            )}
          </div>
        )}

        {/* Оборудование и точки самообслуживания — отдельной строкой, а не в
            каталоге: банкомат и туалет не снимают помещение, и в отраслях они
            дают ложные «Места». */}
        {amenities.length > 0 && (
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">В здании также есть:</span>{' '}
            {amenities.map((item) => (item.count > 1 ? `${item.category} (${item.count})` : item.category)).join(', ')}.
          </p>
        )}

        <p className="text-xs text-ink-faint">
          {source === 'yandex_maps' ? 'Организации из Яндекс.Карт по адресу здания' : 'Организации из справочника 2ГИС по адресу здания'}
          {capturedAt && <> на {new Date(capturedAt).toLocaleDateString('ru-RU')}</>}.
          {partial && (
            <>
              {' '}
              Источник показывает в здании {reportedTotal} {pluralOrganizations(reportedTotal ?? 0)} — выгрузка
              ограничена {organizations.length}, поэтому доли считаются по ним.
            </>
          )}{' '}
          Список организаций мог измениться, а часть арендаторов в справочник не попадает.
        </p>
      </div>
    </div>
  );
}
