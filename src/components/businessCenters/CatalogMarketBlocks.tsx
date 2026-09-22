import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, KeyRound, Layers, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { SOURCE_LABELS, type ExternalMetric, type MarketSnapshot } from '../../data/marketSnapshots';
import { shortName } from '../../lib/businessCenterDisplay';
import type { CatalogOfferIndex } from '../../lib/businessCenterCatalogFilter';

// Каталожные блоки волны 2 (К10–К13 плана docs/bc-catalog-redesign-plan.md).
// Все стоят ПОД результатами: первый экран — это фильтр и карточки, а
// разбор рынка читают те, кто доскроллил.

// --- К10. Офисная насыщенность районов ---------------------------------

export function DistrictDensityBlock({
  centers,
  snapshots,
  activeDistricts,
  onPickDistrict,
}: {
  centers: BusinessCenter[];
  snapshots: MarketSnapshot[] | null;
  activeDistricts: string[];
  onPickDistrict: (district: string) => void;
}) {
  const rows = useMemo(() => {
    const byDistrict = new Map<string, { count: number; area: number }>();
    for (const c of centers) {
      if (!c.district) continue;
      const cur = byDistrict.get(c.district) ?? { count: 0, area: 0 };
      cur.count += 1;
      cur.area += c.totalArea ?? 0;
      byDistrict.set(c.district, cur);
    }
    const rentByDistrict = new Map<string, number>();
    for (const s of snapshots ?? []) {
      if (s.sliceType === 'district' && s.deal === 'rent' && s.median != null) rentByDistrict.set(s.sliceKey, s.median);
    }
    return [...byDistrict.entries()]
      .map(([district, v]) => ({ district, ...v, rent: rentByDistrict.get(district) ?? null }))
      .sort((a, b) => b.area - a.area);
  }, [centers, snapshots]);

  if (rows.length === 0) return null;
  const maxArea = Math.max(...rows.map((r) => r.area));

  return (
    <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Layers className="h-5 w-5 shrink-0 text-ink-muted" />
          Офисная насыщенность районов
        </h2>
        <p className="text-xs text-ink-faint">
          Сумма площадей бизнес-центров каталога по районам и медиана ставки аренды там же. Клик по
          строке включает фильтр по району.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const active = activeDistricts.includes(r.district);
          return (
            <button
              key={r.district}
              type="button"
              onClick={() => onPickDistrict(r.district)}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-surface-muted',
                active && 'bg-surface-muted',
              )}
            >
              <span className={cn('w-32 shrink-0 truncate text-sm sm:w-40', active ? 'font-bold text-ink' : 'text-ink')}>
                {r.district}
              </span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className={cn('block h-full rounded-full', active ? 'bg-primary' : 'bg-border-strong')}
                  style={{ width: `${Math.max(2, Math.round((r.area / maxArea) * 100))}%` }}
                />
              </span>
              <span className="w-40 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:w-52">
                {/* 0 м² не пишем: у «Великого камня» единственное здание без
                    заполненной площади, и «0 м²» читалось бы как факт, а не
                    как «данных нет» (классическая ловушка из CLAUDE.md). */}
                {r.count} БЦ
                {r.area > 0 && ` · ${Math.round(r.area).toLocaleString('ru-RU')} м²`}
                {r.rent != null && ` · $${r.rent}/м²`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- К11. Контекст рынка из внешних источников -------------------------

export function MarketContextBlock({ metrics }: { metrics: ExternalMetric[] | null }) {
  const pick = (source: string, metric: string, sliceKey: string | null = null) =>
    (metrics ?? []).find((m) => m.source === source && m.metric === metric && m.sliceKey === sliceKey) ?? null;

  const cityVacancy = pick('colliers', 'vacancy_rate');
  const stock = pick('colliers', 'total_stock');
  const supply2025 = pick('colliers', 'new_supply');
  const forecast2026 = pick('rezultativnaya-nedvizhimost', 'new_supply_forecast_2026');
  const qualityVacancy = pick('rezultativnaya-nedvizhimost', 'vacancy_rate');
  const deals = pick('goskomimushchestvo', 'registered_deals');

  const items = [cityVacancy, stock, supply2025, forecast2026, qualityVacancy, deals].filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <TrendingUp className="h-5 w-5 shrink-0 text-ink-muted" />
        Вакантность и ввод офисов в Минске
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cityVacancy && (
          <Metric
            value={`${Number(cityVacancy.value).toLocaleString('ru-RU')}%`}
            label="вакантных офисных площадей по городу"
            source={cityVacancy}
          />
        )}
        {qualityVacancy && (
          <Metric
            value={`${Number(qualityVacancy.value).toLocaleString('ru-RU')}%`}
            label="вакантность в качественных БЦ"
            source={qualityVacancy}
          />
        )}
        {stock && (
          <Metric
            value={`${Number(stock.value).toLocaleString('ru-RU')} тыс. м²`}
            label="арендопригодных офисов в городе"
            source={stock}
          />
        )}
        {supply2025 && (
          <Metric
            value={`${Number(supply2025.value).toLocaleString('ru-RU')} тыс. м²`}
            label="введено за 2025 год"
            source={supply2025}
          />
        )}
        {forecast2026 && (
          // toLocaleString, а не шаблон с числом как есть: «54.2 тыс. м²» с
          // точкой рядом с «1 249 тыс. м²» читается как чужая вёрстка.
          <Metric
            value={`${Number(forecast2026.value).toLocaleString('ru-RU')} тыс. м²`}
            label="прогноз ввода на 2026"
            source={forecast2026}
          />
        )}
        {deals && <Metric value={deals.value.toLocaleString('ru-RU')} label="сделок за 1 полугодие 2026" source={deals} />}
      </div>
      {/* Важная оговорка, без которой цифры врут: у Colliers своя
          классификация (A/B1/B2), у «Результативной недвижимости» — своя
          (B+/B−), и ни одна не совпадает с нашей A/B+/B/C от «Твоей
          столицы». Поэтому вакантность показана ПО ГОРОДУ, а не подставлена
          под выбранный в фильтре класс — это было бы сравнение разных
          шкал под видом одной. */}
      <p className="text-xs text-ink-faint">
        Вакантность по классам у внешних источников считается по их собственным классификациям
        (Colliers — A/B1/B2), которые не совпадают с классами A/B+/B/C в этом каталоге, поэтому здесь
        приведены только общегородские значения.
      </p>
    </div>
  );
}

function Metric({ value, label, source }: { value: string; label: string; source: ExternalMetric }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface-muted p-4">
      <span className="text-lg font-extrabold text-ink">{value}</span>
      <span className="text-xs leading-snug text-ink-muted">{label}</span>
      <span className="text-[11px] text-ink-faint">
        {SOURCE_LABELS[source.source] ?? source.source}, {source.period}
      </span>
    </div>
  );
}

// --- К12. Кто управляет зданием ----------------------------------------

export function ManagementBlock({
  centers,
  activeFacts,
  onPickFact,
}: {
  centers: BusinessCenter[];
  activeFacts: string[];
  onPickFact: (id: string) => void;
}) {
  const hoa = centers.filter((c) => c.managementType === 'hoa').length;
  const uk = centers.filter((c) => c.managementType === 'single_uk').length;
  if (hoa + uk === 0) return null;
  const total = hoa + uk;

  return (
    <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <KeyRound className="h-5 w-5 shrink-0 text-ink-muted" />
          Кто управляет зданием
        </h2>
        <p className="text-xs text-ink-faint">
          Среза, кто в здании хозяин, нет ни у одной другой площадки — а для арендатора это меняет и
          цену, и то, с кем вообще договариваться.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onPickFact('hoa')}
          className={cn(
            'flex flex-col gap-1 rounded-2xl p-4 text-left transition-colors',
            activeFacts.includes('hoa') ? 'bg-primary/10' : 'bg-surface-muted hover:bg-border/40',
          )}
        >
          <span className="text-lg font-extrabold text-ink">
            {hoa} <span className="text-sm font-semibold text-ink-muted">из {total}</span>
          </span>
          <span className="text-sm font-bold text-ink">Товарищество собственников</span>
          <span className="text-xs leading-snug text-ink-muted">
            У здания много владельцев: условия, отделка и даже ставка отличаются от этажа к этажу, зато
            с конкретным собственником реально торговаться.
          </span>
        </button>
        <button
          type="button"
          onClick={() => onPickFact('uk')}
          className={cn(
            'flex flex-col gap-1 rounded-2xl p-4 text-left transition-colors',
            activeFacts.includes('uk') ? 'bg-primary/10' : 'bg-surface-muted hover:bg-border/40',
          )}
        >
          <span className="text-lg font-extrabold text-ink">
            {uk} <span className="text-sm font-semibold text-ink-muted">из {total}</span>
          </span>
          <span className="text-sm font-bold text-ink">Единая управляющая компания</span>
          <span className="text-xs leading-snug text-ink-muted">
            Один договор и единые правила на всё здание, предсказуемый сервис — но и ставка обычно
            выше, а торг жёстче.
          </span>
        </button>
      </div>
    </div>
  );
}

// --- К13. Сейчас сдаётся ------------------------------------------------

const LOT_SIZE_PRESETS = [30, 50, 100, 200, 500];

export function AvailableNowBlock({
  centers,
  offers,
  lotSize,
  onPickLotSize,
}: {
  centers: BusinessCenter[];
  offers: CatalogOfferIndex;
  lotSize: number | null;
  onPickLotSize: (size: number | null) => void;
}) {
  const withLots = useMemo(
    () =>
      centers
        .map((c) => ({ center: c, sizes: offers.lotSizesBySlug.get(c.slug) ?? [] }))
        .filter((x) => x.sizes.length > 0)
        .sort((a, b) => b.sizes.length - a.sizes.length),
    [centers, offers],
  );
  if (withLots.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Building2 className="h-5 w-5 shrink-0 text-ink-muted" />
          Сейчас сдаётся и продаётся
        </h2>
        <p className="text-xs text-ink-faint">
          {withLots.length} зданий каталога с активными объявлениями на Kufar, Realt, Domovita и Megapolis. Остальные
          сдают напрямую через управляющую компанию либо заняты.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Нужен офис от</span>
        {LOT_SIZE_PRESETS.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onPickLotSize(lotSize === size ? null : size)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
              lotSize === size
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-surface text-ink hover:border-primary hover:text-primary-hover',
            )}
          >
            {size} м²
          </button>
        ))}
      </div>
      <div className="flex flex-col divide-y divide-border">
        {withLots.slice(0, 10).map(({ center, sizes }) => (
          <Link
            key={center.slug}
            to={`/minsk/bcminsk/${center.slug}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0 hover:text-primary-hover"
          >
            <span className="text-sm font-semibold text-ink">{shortName(center)}</span>
            <span className="text-xs text-ink-muted">
              {sizes.length} {sizes.length === 1 ? 'лот' : 'лотов'} · от{' '}
              {Math.round(Math.min(...sizes)).toLocaleString('ru-RU')} до{' '}
              {Math.round(Math.max(...sizes)).toLocaleString('ru-RU')} м²
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
