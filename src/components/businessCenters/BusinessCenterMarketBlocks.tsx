import { useMemo, useState } from 'react';
import { Building2, Gauge, History, MessageSquare, Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import type { TenantIndustryCityProfile } from '../../data/businessCenter2gis';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import { buildFloorGroups, formatFloorLabel, type TenantAmenity } from '../../lib/businessCenterTenants';
import { TENANT_INDUSTRY_OTHER, tenantIndustryLabel } from '../../data/tenantIndustries';
import { mapRatingFromHighlights } from '../../lib/businessCenterDisplay';
import type { MarketPosition } from '../../lib/businessCenterMarketPosition';

// Авторские блоки карточки БЦ (Б1, Б10, Б11 плана
// docs/bc-catalog-redesign-plan.md) — то, чего на странице не было вовсе:
// до 2026-09-16 карточка отвечала «какая тут площадь», но не «много это или
// мало». Общая идея взята у аналитики Минск Мира: каждое число стоит рядом
// с базой сравнения и выводом, а не само по себе.

// --- Б1. БЦ на фоне конкурентов ----------------------------------------

function Bar({
  label,
  value,
  max,
  tone,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'subject' | 'baseline';
  unit: string;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={cn('w-28 shrink-0 text-xs sm:w-36', tone === 'subject' ? 'font-bold text-ink' : 'text-ink-muted')}>
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={cn('block h-full rounded-full', tone === 'subject' ? 'bg-primary' : 'bg-border-strong')}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className={cn('w-24 shrink-0 text-right text-xs tabular-nums', tone === 'subject' ? 'font-bold text-ink' : 'text-ink-muted')}>
        {/* Деньги пишем как «$18/м²», а не «18 $/м²» — так же, как везде
            на сайте; остальные единицы идут после числа. */}
        {unit.startsWith('$') ? `$${value.toLocaleString('ru-RU')}${unit.slice(1)}` : `${value.toLocaleString('ru-RU')} ${unit}`}
      </span>
    </div>
  );
}

export function MarketPositionBlock({
  position,
}: {
  position: MarketPosition;
}) {
  if (position.bars.length === 0) return null;
  return (
    // id — якорь для липкого меню «На странице» (Б7). scroll-mt — чтобы
    // заголовок не уезжал под липкую шапку при переходе по якорю.
    <div id="market" className={cn('mt-6 flex scroll-mt-32 flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Gauge className="h-5 w-5 shrink-0 text-ink-muted" />
        БЦ на фоне конкурентов
      </h2>

      <div className="flex flex-col gap-5">
        {position.bars.map((bar) => {
          const max = Math.max(bar.value, ...bar.baselines.map((b) => b.value));
          return (
            <div key={bar.label} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-bold text-ink">{bar.label}</span>
                {bar.note && <span className="text-xs text-ink-muted">{bar.note}</span>}
              </div>
              <Bar label="это здание" value={bar.value} max={max} tone="subject" unit={bar.unit} />
              {bar.baselines.map((b) => (
                <Bar key={b.label} label={b.label} value={b.value} max={max} tone="baseline" unit={bar.unit} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Б10. Таймлайн истории ---------------------------------------------

// Годы из свободного текста «Интересных фактов» (есть у 133 зданий).
// Диапазон 1850–2100 — чтобы не принять за год площадь («18 007 м²») или
// номер дома; берём только первое упоминание в предложении, иначе одна
// фраза про «с 1998 по 2004» даёт две точки на шкале об одном и том же.
const YEAR_RE = /\b(1[89]\d{2}|20\d{2}|21\d{2})\b/;

export interface HistoryPoint {
  year: number;
  text: string;
}

export function extractHistoryPoints(center: BusinessCenter): HistoryPoint[] {
  const source = center.highlights.find((h) => h.icon === 'history');
  if (!source) return [];
  const points: HistoryPoint[] = [];
  for (const raw of source.text.split(/(?<=[.!?])\s+|\n+/)) {
    const sentence = raw.replace(/^[-–—•\s]+/, '').trim();
    if (!sentence) continue;
    const m = sentence.match(YEAR_RE);
    if (!m) continue;
    const year = Number(m[1]);
    if (points.some((p) => p.year === year)) continue;
    points.push({ year, text: sentence });
  }
  return points.sort((a, b) => a.year - b.year);
}

export function HistoryTimeline({ center }: { center: BusinessCenter }) {
  const points = useMemo(() => extractHistoryPoints(center), [center]);
  // Одна точка — это не шкала, а предложение: такой «таймлайн» выглядел бы
  // как ошибка вёрстки. Текст в этом случае остаётся в общем блоке фактов.
  if (points.length < 2) return null;
  return (
    <div id="history" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <History className="h-5 w-5 shrink-0 text-ink-muted" />
        История здания
      </h2>
      <ol className="flex flex-col gap-4 border-l border-border pl-5">
        {points.map((p) => (
          <li key={p.year} className="relative">
            <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="block text-sm font-bold text-ink">{p.year}</span>
            <span className="block text-sm leading-relaxed text-ink-muted">{p.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- Б11. Что говорят ---------------------------------------------------

export function WhatTheySayBlock({ center, reviewQuotes }: { center: BusinessCenter; reviewQuotes: string[] }) {
  const yandex = mapRatingFromHighlights(center.highlights);
  const hasGis = center.gisRating != null;
  if (!yandex && !hasGis && reviewQuotes.length === 0) return null;
  return (
    <div id="reviews" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <MessageSquare className="h-5 w-5 shrink-0 text-ink-muted" />
        Что говорят
      </h2>
      {/* Два источника рядом, но НЕ усреднённые в одну цифру: сводить чужие
          оценки в собственный рейтинг мы не собираемся (решение из
          BCMINSK_SEO_PLAN.md — никакого AggregateRating), да и считаются
          они по-разному. */}
      <div className="flex flex-wrap gap-3">
        {hasGis && (
          <div className="flex items-center gap-2 rounded-2xl bg-surface-muted px-4 py-3">
            <Star className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="text-sm text-ink-muted">
              <span className="font-bold text-ink">{center.gisRating}</span> на 2ГИС
              {center.gisReviewCount != null && ` · ${center.gisReviewCount} оценок`}
            </span>
          </div>
        )}
        {yandex && (
          <div className="flex items-center gap-2 rounded-2xl bg-surface-muted px-4 py-3">
            <Star className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="text-sm text-ink-muted">
              <span className="font-bold text-ink">{yandex.label}</span> на {yandex.source}
            </span>
          </div>
        )}
      </div>
      {reviewQuotes.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviewQuotes.map((q) => (
            <blockquote key={q} className="border-l-2 border-border pl-3 text-sm italic leading-relaxed text-ink-muted">
              {q}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Б9. Кто сидит в здании ---------------------------------------------
//
// Диаграмма отраслей арендаторов из справочника 2GIS (организации в здании
// собирает scripts/sync-2gis-tenants.mjs). Отрасль — общая рубрика 2GIS, не
// наша выдумка (см. data/tenantIndustries.ts), а рядом с долей здания стоит
// доля той же отрасли по всем БЦ каталога: без базы сравнения "20% юристов"
// ничего не говорит читателю — тот же принцип, что и в Б1.
//
// Старый список арендаторов из веб-архива Яндекс.Карт (24 здания) остаётся
// фолбэком на карточках, куда 2GIS ещё не доехал: он даёт названия, но не
// рубрики 2GIS, и отраслей из него не построить.

const VISIBLE_INDUSTRIES = 8;

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
      // "Другое" — всегда последним: это не отрасль, а остаток, наверху шкалы
      // ему не место. У яндексовской базы он крупный и честный — 871
      // организация из 7608 сидит в рубрике "Офис организации", про которую
      // источник не говорит ничего, кроме того, что это офис.
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

function pluralReviews(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'оценка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'оценки';
  return 'оценок';
}

// Сколько организаций показывать в списке сразу: у крупных зданий их под
// сотню, и вываливать всё полотном первым экраном незачем.
const VISIBLE_TENANTS = 12;

// Этажи показываем, только когда они известны хотя бы у трети арендаторов:
// на десятке из девяноста "по этажам" — не срез здания, а случайная выборка.
const FLOOR_SUMMARY_MIN_SHARE = 0.3;

export function TenantIndustriesBlock({
  organizations,
  amenities,
  total,
  fetchedAt,
  cityProfile,
  source,
}: {
  organizations: TenantOrganizationView[];
  amenities?: TenantAmenity[];
  total: number | null;
  fetchedAt: string | null;
  cityProfile: TenantIndustryCityProfile | null;
  source: 'yandex_maps' | '2gis';
}) {
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const rows = useMemo(() => buildIndustryRows(organizations, cityProfile), [organizations, cityProfile]);
  const floorGroups = useMemo(() => buildFloorGroups(organizations), [organizations]);
  const visibleRows = expanded ? rows : rows.slice(0, VISIBLE_INDUSTRIES);
  const hiddenCount = rows.length - visibleRows.length;
  const visibleTenants = listExpanded ? organizations : organizations.slice(0, VISIBLE_TENANTS);
  const withFloor = organizations.filter((org) => org.floor).length;
  const showFloors = organizations.length > 0 && withFloor / organizations.length >= FLOOR_SUMMARY_MIN_SHARE;
  // Шкала общая для полосы здания и метки города, иначе метка врёт: рисуем
  // её от максимума из обоих значений, а не от 100% — при 26 отраслях
  // самая крупная редко занимает больше четверти, и шкала на 100% дала бы
  // восемь одинаковых огрызков.
  const scale = Math.max(...visibleRows.map((row) => Math.max(row.share, row.cityShare ?? 0)), 0.01);
  const partial = total != null && total > organizations.length;

  return (
    <div id="tenants" className={cn('mt-6 flex scroll-mt-32 flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Building2 className="h-5 w-5 shrink-0 text-ink-muted" />
          Кто сидит в здании
        </h2>
        <p className="text-sm text-ink-muted">
          <span className="font-bold text-ink">
            {organizations.length} {pluralOrganizations(organizations.length)}
          </span>{' '}
          · {rows.length} {pluralIndustries(rows.length)}
          {cityProfile && cityProfile.buildingTotal > 0 && (
            <> · для сравнения — доля отрасли по {cityProfile.buildingTotal} зданиям каталога</>
          )}
        </p>
      </div>

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
                  // Метка города — тонкая риска поверх полосы, с зазором в
                  // цвет подложки по бокам, чтобы не слипалась с заливкой.
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

      {rows.length > VISIBLE_INDUSTRIES && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-sm font-semibold text-primary-hover hover:underline"
        >
          {expanded ? 'Свернуть' : `Показать ещё ${hiddenCount} ${pluralIndustries(hiddenCount)}`}
        </button>
      )}

      {cityProfile && cityProfile.orgTotal > 0 && (
        <p className="flex items-center gap-2 text-xs text-ink-faint">
          <span className="inline-block h-3 w-0.5 shrink-0 rounded-full bg-primary" />
          доля этой отрасли в среднем по бизнес-центрам каталога
        </p>
      )}

      {/* Этажи — то, чего нет ни в данных 2GIS, ни в старом списке из
          веб-архива: арендатору важно не только "кто здесь", но и "сколько
          соседей на моём этаже". Считаем только по тем, у кого этаж известен,
          и подписываем это, а не выдаём за полный расклад по зданию. */}
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

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          className="self-start text-sm font-semibold text-primary-hover hover:underline"
        >
          {listOpen ? 'Скрыть список организаций' : 'Показать список организаций'}
        </button>
        {listOpen && (
          <>
            <ul className="flex flex-col divide-y divide-border">
              {visibleTenants.map((org, index) => (
                <li
                  key={`${org.name}-${org.url ?? index}`}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-sm first:pt-0"
                >
                  {org.url ? (
                    // Внешняя ссылка на карточку источника: nofollow, потому
                    // что это атрибуция, а не рекомендация.
                    <a
                      href={org.url}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="font-semibold text-ink hover:text-primary-hover hover:underline"
                    >
                      {org.name}
                    </a>
                  ) : (
                    <span className="font-semibold text-ink">{org.name}</span>
                  )}
                  {org.rubric && <span className="text-ink-muted">{org.rubric}</span>}
                  {org.placement && <span className="text-ink-faint">{org.placement}</span>}
                  {org.rating != null && (
                    <span className="tabular-nums text-ink-faint">
                      {org.rating.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      {org.reviewCount != null && (
                        <>
                          {' '}
                          · {org.reviewCount} {pluralReviews(org.reviewCount)}
                        </>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {organizations.length > VISIBLE_TENANTS && (
              <button
                type="button"
                onClick={() => setListExpanded((v) => !v)}
                className="self-start text-sm font-semibold text-primary-hover hover:underline"
              >
                {listExpanded
                  ? 'Свернуть список'
                  : `Показать все ${organizations.length} ${pluralOrganizations(organizations.length)}`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Оборудование и точки самообслуживания идут отдельной строкой, а не в
          списке арендаторов: банкомат и туалет — не организация, снявшая
          помещение, и в отраслях они дают ложные "Места". */}
      {amenities && amenities.length > 0 && (
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">В здании также есть:</span>{' '}
          {amenities
            .map((item) => (item.count > 1 ? `${item.category} (${item.count})` : item.category))
            .join(', ')}
          .
        </p>
      )}

      <p className="text-xs text-ink-faint">
        {source === 'yandex_maps' ? 'Организации из Яндекс.Карт по адресу здания' : 'Организации из справочника 2ГИС по адресу здания'}
        {fetchedAt && <> на {new Date(fetchedAt).toLocaleDateString('ru-RU')}</>}.
        {partial && (
          <>
            {' '}
            Источник показывает в здании {total} {pluralOrganizations(total ?? 0)} — выгрузка ограничена{' '}
            {organizations.length}, поэтому доли считаются по ним.
          </>
        )}{' '}
        Список организаций мог измениться, а часть арендаторов в справочник не попадает.
      </p>
    </div>
  );
}
