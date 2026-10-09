import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import {
  setArticleJsonLd,
  setBreadcrumbJsonLd,
  setDatasetJsonLd,
  setFaqJsonLd,
  setGenericPageMeta,
  setOrganizationJsonLd,
} from '../lib/pageMeta';
import { fetchPublicMarketOffers } from '../lib/marketOffersApi';
import { fetchPrimaryMarketOffers } from '../lib/primaryMarketOffersApi';
import { AREA_BUCKET_ORDER, MARKET_PROPERTY_TYPES, areaBucket, netPricePerSqm, netSize, type MarketOffer } from '../data/marketOffers';
import { buildPrimaryMarketPivot, buildPrimarySalesSummary, earliestSoldAt, type PrimaryMarketOffer } from '../data/primaryMarketOffers';

// Сводные таблицы вторичного рынка (buildMarketPivot/countSmallFinishedOffices/
// median) — та же логика, что и в DistrictGuidePage.tsx (её собственный блок
// "Вторичный рынок"), СОЗНАТЕЛЬНО продублирована, не импортирована: этот файл
// активно и часто меняется параллельной SEO-сессией (см. её же комментарии
// про этот же приём для buildMarketPivot), лишний общий импорт — риск
// конфликта при следующей правке того файла. Первичный рынок, наоборот,
// использует общий data/primaryMarketOffers.ts (buildPrimaryMarketPivot) —
// та функция уже вынесена в отдельный модуль, не дублируется нигде.
interface MarketPivotCell {
  count: number;
  medianPrice: number;
}
interface MarketPivotRow {
  propertyType: string;
  cells: (MarketPivotCell | null)[];
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function buildMarketPivot(offers: MarketOffer[], dealType: 'sale' | 'rent', finishStatus: string): MarketPivotRow[] {
  const byType = new Map<string, Map<string, number[]>>();
  for (const offer of offers) {
    if (!offer.reviewed || offer.rejected || offer.dealType !== dealType || offer.finishStatus !== finishStatus) continue;
    if (!byType.has(offer.propertyType)) byType.set(offer.propertyType, new Map());
    const byBucket = byType.get(offer.propertyType)!;
    const bucket = areaBucket(netSize(offer));
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(netPricePerSqm(offer));
  }
  return MARKET_PROPERTY_TYPES.filter((type) => byType.has(type)).map((propertyType) => {
    const byBucket = byType.get(propertyType)!;
    const cells = AREA_BUCKET_ORDER.map((bucket) => {
      const prices = byBucket.get(bucket);
      return prices ? { count: prices.length, medianPrice: Math.round(median(prices)) } : null;
    });
    return { propertyType, cells };
  });
}

const MARKET_FINISH_OPTIONS = ['С отделкой', 'Без отделки'] as const;
const MARKET_FINISH_TO_DB: Record<(typeof MARKET_FINISH_OPTIONS)[number], string> = {
  'С отделкой': 'с отделкой',
  'Без отделки': 'без отделки',
};

const TITLE = 'Цены на коммерческую недвижимость в Минск Мире — Redevelopment';
const DESCRIPTION =
  'Первичный и вторичный рынок коммерческой недвижимости в Минск Мире: цены на бизнес-апартаменты, торговые и офисные помещения, по данным bir.by, Kufar и Realt.';
const URL = 'https://redevelopment.pro/minsk/analytics/minsk-mir';

// PageSpeed 2026-10-09: на /minsk/analytics/minsk-mir мобильный Performance
// 74 из-за CLS 0,40. React не гидратирует снапшот (createRoot, см. main.tsx),
// а сносит его и рисует «Загрузка…» одной строкой — таблицы схлопываются,
// затем блок «Продажи застройщика» вставляется между секциями и двигает
// вторичный рынок (culprit CLS 0,29). Запросы поднимаем лениво через
// load* ниже; на самом URL аналитики — сразу при разборе модуля (параллельно
// waitForPrerenderedPaint), на остальных страницах — только из useEffect
// при монтировании (модуль в общем бандле публички, см. App.tsx). Первый
// стейт берём из кэша: если ответы успели до монтирования, снапшот сразу
// заменяется готовыми таблицами. Пока кэш пуст — скелетоны той же высоты.
let cachedPrimaryOffers: PrimaryMarketOffer[] | null = null;
let cachedMarketOffers: MarketOffer[] | null = null;
let primaryOffersPromise: Promise<PrimaryMarketOffer[]> | null = null;
let marketOffersPromise: Promise<MarketOffer[]> | null = null;

function loadPrimaryOffers(): Promise<PrimaryMarketOffer[]> {
  if (!primaryOffersPromise) {
    primaryOffersPromise = fetchPrimaryMarketOffers()
      .then((data) => {
        cachedPrimaryOffers = data;
        return data;
      })
      .catch(() => {
        cachedPrimaryOffers = [];
        return [] as PrimaryMarketOffer[];
      });
  }
  return primaryOffersPromise;
}

function loadMarketOffers(): Promise<MarketOffer[]> {
  if (!marketOffersPromise) {
    marketOffersPromise = fetchPublicMarketOffers()
      .then((data) => {
        cachedMarketOffers = data;
        return data;
      })
      .catch(() => {
        cachedMarketOffers = [];
        return [] as MarketOffer[];
      });
  }
  return marketOffersPromise;
}

const isMinskMirAnalyticsPath =
  typeof window !== 'undefined' &&
  window.location.pathname.replace(/\/+$/, '') === '/minsk/analytics/minsk-mir';if (isMinskMirAnalyticsPath) {
  void loadPrimaryOffers();
  void loadMarketOffers();
}

// Резервировать место под «Продажи» только если оно уже было в снапшоте —
// иначе первый клиентский кадр сам вставит пустой блок и даст CLS.
const prerenderHadSalesSection =
  typeof document !== 'undefined' &&
  (document.getElementById('root')?.textContent?.includes('Продажи застройщика') ?? false);// Точечные цвета для контраста ≥4.5:1 на bg (#f0efed) / surface — глобальные
// токены ink-faint / primary на этом фоне дают 2.4–4.11 (PageSpeed a11y 86).
// Тот же приём, что text-[#0f6b3d] у бейджа «Обновлено» (PAGESPEED_PLAN Э8-3).
const LOGO_RED = 'text-[#b01020]';
const MUTED_OK = 'text-[#5a5c64]';
const FAINT_OK = 'text-[#6b6d76]';
const IN_TEXT_LINK = 'font-medium text-[#9a1020] underline hover:text-primary-hover';

function PrimaryTableSkeleton() {
  return (
    <div className={cn('min-h-[280px] overflow-x-auto p-2', glassCardClass)} style={glassCardShadow} aria-busy="true">
      <p className={cn('px-3 py-2 text-sm', MUTED_OK)}>Загрузка…</p>
      <div className="flex flex-col gap-2 px-3 pb-3" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-8 rounded-control bg-surface-muted/80" />
        ))}
      </div>
    </div>
  );
}

function SecondaryTableSkeleton() {
  return (
    <div className="flex min-h-[320px] flex-col gap-3" aria-busy="true">
      <p className={cn('text-sm', MUTED_OK)}>Загрузка…</p>
      <div className="h-10 max-w-md rounded-full bg-surface-muted/80" aria-hidden="true" />
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-12 rounded-control bg-surface-muted/80" />
        ))}
      </div>
    </div>
  );
}

function SalesSectionSkeleton() {
  // Резерв высоты под карточку «Продажи застройщика», пока primary ещё грузится:
  // иначе секция появляется ПОСЛЕ первой отрисовки и сдвигает вторичный рынок.
  return (
    <section
      className={cn('flex min-h-[340px] flex-col gap-3 p-5', glassCardClass)}
      style={glassCardShadow}
      aria-busy="true"
      aria-label="Загрузка сводки продаж застройщика"
    >
      <div className="h-6 w-48 rounded-control bg-surface-muted/80" aria-hidden="true" />
      <div className="h-12 w-full rounded-control bg-surface-muted/80" aria-hidden="true" />
      <div className="grid grid-cols-2 gap-3 sm:w-fit">
        <div className="h-16 rounded-control bg-surface-muted/80" aria-hidden="true" />
        <div className="h-16 rounded-control bg-surface-muted/80" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-8 rounded-control bg-surface-muted/80" />
        ))}
      </div>
    </section>
  );
}

export function MinskMirAnalyticsPage() {
  const [marketOffers, setMarketOffers] = useState<MarketOffer[] | null>(() => cachedMarketOffers);
  const [primaryOffers, setPrimaryOffers] = useState<PrimaryMarketOffer[] | null>(() => cachedPrimaryOffers);
  const [marketDealType, setMarketDealType] = useState<'Продажа' | 'Аренда'>('Продажа');
  const [marketFinish, setMarketFinish] = useState<(typeof MARKET_FINISH_OPTIONS)[number]>('С отделкой');

  useEffect(() => {
    let cancelled = false;
    loadPrimaryOffers().then((data) => {
      if (!cancelled) setPrimaryOffers(data);
    });
    loadMarketOffers().then((data) => {
      if (!cancelled) setMarketOffers(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const primaryPivot = useMemo(() => (primaryOffers ? buildPrimaryMarketPivot(primaryOffers) : []), [primaryOffers]);
  const salesRows = useMemo(() => (primaryOffers ? buildPrimarySalesSummary(primaryOffers) : []), [primaryOffers]);
  const salesSince = useMemo(() => (primaryOffers ? earliestSoldAt(primaryOffers) : null), [primaryOffers]);
  const totalSoldCount = useMemo(() => salesRows.reduce((sum, r) => sum + r.soldCount, 0), [salesRows]);
  const totalSoldValueEur = useMemo(() => salesRows.reduce((sum, r) => sum + r.soldValueEur, 0), [salesRows]);
  const secondaryReviewedCount = useMemo(
    () => (marketOffers ?? []).filter((o) => o.reviewed && !o.rejected).length,
    [marketOffers],
  );

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: URL, ogType: 'article' });
    setOrganizationJsonLd(false);
    setBreadcrumbJsonLd([
      { name: 'Минск', url: 'https://redevelopment.pro/minsk' },
      { name: 'Аналитика рынка', url: 'https://redevelopment.pro/minsk/analytics' },
      { name: 'Минск Мир' },
    ]);
    const now = new Date().toISOString().slice(0, 10);
    setArticleJsonLd({ headline: TITLE, description: DESCRIPTION, url: URL, datePublished: '2026-09-07', dateModified: now });
    setDatasetJsonLd({
      name: TITLE,
      description: DESCRIPTION,
      url: URL,
      datePublished: '2026-09-07',
      dateModified: now,
      measurementTechnique: 'Медиана цены за м² по проверенным объявлениям Kufar/Realt (вторичка) и данным застройщика bir.by (первичка)',
    });
    const faq: { question: string; answer: string }[] = [];
    const apartsSdano = primaryPivot.find((r) => r.key === 'apartments-sdano');
    if (apartsSdano) {
      faq.push({
        question: 'Сколько стоят бизнес-апартаменты в Минск Мире в сданных домах?',
        answer: `От застройщика — от ${apartsSdano.priceMinEur.toLocaleString('ru-RU')} до ${apartsSdano.priceMaxEur.toLocaleString('ru-RU')} EUR/м² (в среднем ${apartsSdano.priceAvgEur.toLocaleString('ru-RU')} EUR/м², ${apartsSdano.count} предложений).`,
      });
    }
    if (totalSoldCount > 0) {
      faq.push({
        question: 'Сколько объектов уже продал застройщик?',
        answer: `Автоматическое отслеживание фиксирует объекты, пропавшие с bir.by после того, как ранее там продавались — предположительно проданы или переданы в бронь: ${totalSoldCount} объектов на сумму примерно ${Math.round(totalSoldValueEur).toLocaleString('ru-RU')} EUR (по последней известной цене объявления, не факт сделки).`,
      });
    }
    faq.push({
      question: 'Чем первичный рынок отличается от вторичного в этих цифрах?',
      answer:
        'Первичный — прямые предложения застройщика Dana Holdings (bir.by), цены в евро. Вторичный — активные объявления собственников и агентств на Kufar и Realt.by, цены в долларах. Валюты не пересчитываются друг в друга — сравнивайте с поправкой на курс.',
    });
    faq.push({
      question: 'Откуда берутся данные?',
      answer:
        'Первичный рынок — с портала застройщика bir.by. Вторичный — с Kufar и Realt.by, каждое объявление проверяется вручную перед тем, как попасть в сводку. Подробный гид по району — на отдельной странице.',
    });
    setFaqJsonLd(faq);
  }, [primaryPivot, totalSoldCount, totalSoldValueEur]);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 sm:px-8">
          <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
            <span className={cn('font-black', LOGO_RED)}>RED</span>EVELOPMENT
          </Link>
        </div>
      </div>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-2">
          <span className={cn('text-xs font-medium uppercase tracking-wide', FAINT_OK)}>
            <Link to="/minsk/analytics" className="hover:text-primary-hover">
              Аналитика рынка
            </Link>{' '}
            / Минск Мир
          </span>
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Цены на коммерческую недвижимость в Минск Мире</h1>
          <p className={cn('max-w-2xl text-sm', MUTED_OK)}>
            Первичный рынок (застройщик, bir.by) и вторичный рынок (объявления собственников, Kufar и Realt.by) в
            одном месте.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ink">Первичный рынок — от застройщика</h2>
          {primaryOffers === null && <PrimaryTableSkeleton />}
          {primaryOffers !== null && primaryPivot.length === 0 && (
            <p className={cn('text-sm', MUTED_OK)}>Данные пока не собраны.</p>
          )}
          {primaryPivot.length > 0 && (
            <div className={cn('overflow-x-auto p-2', glassCardClass)} style={glassCardShadow}>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className={cn('text-left text-xs font-medium uppercase tracking-wide', FAINT_OK)}>
                    <th className="px-3 py-2">Категория</th>
                    <th className="px-3 py-2">Площадь</th>
                    <th className="px-3 py-2">Цена за м² (EUR)</th>
                    <th className="px-3 py-2">Предложений</th>
                  </tr>
                </thead>
                <tbody>
                  {primaryPivot.map((row) => (
                    <tr key={row.key} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-ink">{row.label}</td>
                      <td className={cn('px-3 py-2', MUTED_OK)}>
                        {row.areaMin === row.areaMax ? `${row.areaMin} м²` : `${row.areaMin}–${row.areaMax} м²`}
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {row.priceMinEur.toLocaleString('ru-RU')}–{row.priceMaxEur.toLocaleString('ru-RU')} (в среднем{' '}
                        {row.priceAvgEur.toLocaleString('ru-RU')})
                      </td>
                      <td className={cn('px-3 py-2', MUTED_OK)}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Продажи застройщика (владелец, 2026-09-10: "раз у нас есть инфа,
            сколько юнитов снял с сайта застройщик, значит у нас есть инфа по
            продажам застройщика — я бы выводил эту инфу"). Та же логика, что
            и на гиде района (DistrictGuidePage.tsx) — общий data/primaryMarketOffers.ts,
            не дублируется.

            Владелец, тем же днём: "Если свежей статистики у нас нет, то не
            выводи этот блок на странице вообще" — вся секция (была заглушка
            "отслеживание запущено") рендерится ТОЛЬКО при totalSoldCount > 0.
            Пока primary грузится — скелетон той же высоты (CLS, 2026-10-09). */}
        {primaryOffers === null && prerenderHadSalesSection && <SalesSectionSkeleton />}
        {totalSoldCount > 0 && (
          <section className={cn('flex flex-col gap-3 p-5', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Продажи застройщика</h2>
            <p className={cn('text-sm', MUTED_OK)}>
              Объекты, пропавшие с bir.by после того, как ранее там продавались — предположительно проданы или
              переданы в бронь. Не факт сделки: сумма ниже — по последней известной цене объявления, не по цене
              договора.
            </p>
            {salesSince && (
              <p className={cn('-mt-1 text-xs', MUTED_OK)}>
                Зафиксировано с{' '}
                {new Date(salesSince).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:w-fit sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-control border border-border p-3">
                <span className={cn('text-xs', FAINT_OK)}>Продано/снято</span>
                <span className="text-lg font-extrabold text-ink">{totalSoldCount.toLocaleString('ru-RU')}</span>
              </div>
              <div className="flex flex-col gap-1 rounded-control border border-border p-3">
                <span className={cn('text-xs', FAINT_OK)}>Оценочная сумма</span>
                <span className="text-lg font-extrabold text-ink">{Math.round(totalSoldValueEur).toLocaleString('ru-RU')} EUR</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className={cn('border-b border-border text-xs font-semibold uppercase tracking-wide', MUTED_OK)}>
                    <th scope="col" className="py-2 pr-3 text-left">Категория</th>
                    <th scope="col" className="py-2 px-2 text-right font-semibold">Продано/снято</th>
                    <th scope="col" className="py-2 px-2 text-right font-semibold">Площадь, м²</th>
                    <th scope="col" className="py-2 pl-2 text-right font-semibold">Сумма, EUR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {salesRows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="whitespace-nowrap py-2.5 pr-3 text-left font-medium text-ink">{row.label}</th>
                      <td className="py-2.5 px-2 text-right tabular-nums text-ink">{row.soldCount}</td>
                      <td className={cn('py-2.5 px-2 text-right tabular-nums', MUTED_OK)}>{row.soldAreaM2}</td>
                      <td className="py-2.5 pl-2 text-right tabular-nums font-semibold text-ink">
                        {row.soldValueEur.toLocaleString('ru-RU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={cn('flex flex-col gap-3 p-5', glassCardClass)} style={glassCardShadow}>
          <div className="flex min-w-0 items-center gap-3">
            <TrendingUp className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Вторичный рынок — объявления собственников</h2>
          </div>
          <p className={cn('text-sm', MUTED_OK)}>
            Действующие проверенные объявления продажи и аренды на Kufar и Realt.by — количество и медианная цена за
            м² по типу помещения и площади.
            {secondaryReviewedCount > 0 && ` Учтено ${secondaryReviewedCount} проверенных объявлений.`}
          </p>
          {marketOffers === null && <SecondaryTableSkeleton />}
          {marketOffers !== null && marketOffers.length === 0 && (
            <p className={cn('text-sm', MUTED_OK)}>Данные пока не собраны.</p>
          )}
          {marketOffers && marketOffers.length > 0 && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <ToggleGroup
                  options={['Продажа', 'Аренда']}
                  value={marketDealType}
                  onChange={(value) => setMarketDealType(value as 'Продажа' | 'Аренда')}
                />
                <ToggleGroup
                  label="Отделка"
                  options={[...MARKET_FINISH_OPTIONS]}
                  value={marketFinish}
                  onChange={(value) => setMarketFinish(value as (typeof MARKET_FINISH_OPTIONS)[number])}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className={cn('border-b border-border text-xs font-semibold uppercase tracking-wide', MUTED_OK)}>
                      <th scope="col" className="py-2 pr-3 text-left">
                        Тип помещения
                      </th>
                      {AREA_BUCKET_ORDER.map((bucket) => (
                        <th scope="col" key={bucket} className="py-2 px-2 text-right font-semibold">
                          {bucket}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {buildMarketPivot(marketOffers, marketDealType === 'Продажа' ? 'sale' : 'rent', MARKET_FINISH_TO_DB[marketFinish]).map(
                      (row) => (
                        <tr key={row.propertyType}>
                          <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                            {row.propertyType}
                          </th>
                          {row.cells.map((cell, i) => (
                            <td key={i} className="py-2.5 px-2 text-right tabular-nums">
                              {cell ? (
                                <>
                                  <div className="font-semibold text-ink">{cell.count}</div>
                                  <div className={cn('text-xs', MUTED_OK)}>${cell.medianPrice}/м²</div>
                                </>
                              ) : (
                                <span className={FAINT_OK}>—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <p className={cn('text-xs', MUTED_OK)}>Сверху — количество предложений, снизу — медианная цена за м² в долларах.</p>
            </>
          )}
        </section>

        <section className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Что это за цифры</h2>
          <p className={cn('text-sm leading-relaxed', MUTED_OK)}>
            Первичный рынок — прямые предложения застройщика (портал bir.by), цены в евро, без пересчёта.
            Вторичный — действующие объявления Kufar и Realt.by, каждое проходит ручную проверку перед публикацией
            в сводке (статус отделки, тип помещения, площадь), цены в долларах. Валюты между собой не
            пересчитываются — это два разных источника с разной методикой, показывать их слитно в одной цифре было
            бы неточно.
          </p>
          <p className={cn('text-sm', MUTED_OK)}>
            Подробный гид по району (застройщик, транспорт, инфраструктура, аналитика по нишам бизнеса) —{' '}
            <Link to="/minsk/minsk-mir" className={IN_TEXT_LINK}>
              на отдельной странице
            </Link>
            . Методика расчёта общих аналитических страниц — на{' '}
            <Link to="/minsk/analytics/metodika" className={IN_TEXT_LINK}>
              странице методики
            </Link>
            .
          </p>
        </section>

        {/* CTA-блок Red One убран 2026-09-16 по решению владельца: пока
            здание не куплено, продавать его нечего, а страницу смотрят СМИ.
            Вернуть вместе с остальными ссылками (гид по району, посадочные
            Минск Мира, каталог БЦ), когда здание будет куплено. */}
      </main>
    </div>
  );
}
