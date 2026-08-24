import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta } from '../lib/pageMeta';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { fetchMarketOffers } from '../lib/marketOffersApi';
import { AREA_BUCKET_ORDER, areaBucket, MARKET_PROPERTY_TYPES, netSize, netPricePerSqm } from '../data/marketOffers';
import type { MarketOffer } from '../data/marketOffers';
import { DISTRICTS, DISTRICTS_WITH_ANALYTICS } from '../data/districts';

// Аналитика рынка по конкретному району (/minsk/analytics/:district) —
// отдельная от гида (/minsk/:district) страница: другой поисковый интент
// (конкретные цифры, не описание района для арендатора). Сейчас реальные
// данные есть только для Минск Мира — market_offers целиком геопривязан к
// нему на уровне скрипта синка (нет колонки district), поэтому у остальных
// районов из DISTRICTS этой странице попросту нечего показать — редиректим
// на хаб аналитики, а не рендерим пустую/тонкую страницу.
//
// Таблица и расчёт медианы намеренно ПРОДУБЛИРОВАНЫ из DistrictGuidePage.tsx
// (там тот же блок инлайн, "Рынок коммерческой недвижимости"), а не
// вынесены в общий модуль: тот файл активно дорабатывается в параллельной
// SEO-сессии почти на каждый коммит, лишняя правка структуры файла ради
// переиспользования — риск конфликтов на пустом месте. Если понадобится
// синхронизировать логику — искать обе копии по комментарию с этим же
// объяснением.

const MARKET_PROPERTY_TYPE_ORDER = MARKET_PROPERTY_TYPES;

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
    if (!offer.reviewed || offer.dealType !== dealType || offer.finishStatus !== finishStatus) continue;
    if (!byType.has(offer.propertyType)) byType.set(offer.propertyType, new Map());
    const byBucket = byType.get(offer.propertyType)!;
    const bucket = areaBucket(netSize(offer));
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(netPricePerSqm(offer));
  }

  return MARKET_PROPERTY_TYPE_ORDER.filter((type) => byType.has(type)).map((propertyType) => {
    const byBucket = byType.get(propertyType)!;
    const cells = AREA_BUCKET_ORDER.map((bucket) => {
      const prices = byBucket.get(bucket);
      return prices ? { count: prices.length, medianPrice: Math.round(median(prices)) } : null;
    });
    return { propertyType, cells };
  });
}

function countSmallFinishedOffices(offers: MarketOffer[], dealType: 'sale' | 'rent'): number {
  return offers.filter(
    (o) =>
      o.reviewed && o.dealType === dealType && o.propertyType === 'Офисы' && netSize(o) < 40 && o.finishStatus === 'с отделкой',
  ).length;
}

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function formatLatestUpdate(offers: MarketOffer[]): string {
  const latest = offers.reduce((max, o) => (o.updatedAt > max ? o.updatedAt : max), offers[0].updatedAt);
  const date = new Date(latest);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const MARKET_FINISH_OPTIONS = ['С отделкой', 'Без отделки', 'Не указано'] as const;
const MARKET_FINISH_TO_DB: Record<(typeof MARKET_FINISH_OPTIONS)[number], string> = {
  'С отделкой': 'с отделкой',
  'Без отделки': 'без отделки',
  'Не указано': 'не указано',
};

export function DistrictAnalyticsPage() {
  const { district } = useParams();
  const known = DISTRICTS.find((d) => d.slug === district);
  const hasData = !!district && DISTRICTS_WITH_ANALYTICS.includes(district);

  const [marketOffers, setMarketOffers] = useState<MarketOffer[] | null>(null);
  const [marketDealType, setMarketDealType] = useState<'Продажа' | 'Аренда'>('Продажа');
  const [marketFinish, setMarketFinish] = useState<(typeof MARKET_FINISH_OPTIONS)[number]>('С отделкой');

  const title = known ? `Цены на коммерческую недвижимость: ${known.name}` : 'Аналитика рынка';
  const description = known
    ? `Действующие предложения продажи и аренды коммерческих помещений в районе ${known.name} — количество и медианная цена за м² по типу помещения и площади.`
    : '';
  const pageUrl = `https://redevelopment.pro/minsk/analytics/${district ?? ''}`;

  useEffect(() => {
    if (!hasData) return;
    setGenericPageMeta({ title, description, url: pageUrl });
  }, [hasData, title, description, pageUrl]);

  useEffect(() => {
    if (!hasData) return;
    fetchMarketOffers()
      .then(setMarketOffers)
      .catch(() => setMarketOffers([]));
  }, [hasData]);

  if (!hasData) return <Navigate to="/minsk/analytics" replace />;

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 sm:px-8">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <Link to="/minsk/analytics" className="w-fit text-sm font-medium text-ink-muted hover:text-primary">
            ← Аналитика рынка
          </Link>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold text-ink sm:text-3xl">
            <TrendingUp className="h-6 w-6 shrink-0 text-ink-faint" />
            {title}
          </h1>
        </div>

        <div className={cn('flex flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-muted">{description}</p>
            {marketOffers && marketOffers.length > 0 && (
              <span className="shrink-0 text-xs text-ink-faint">Kufar · {formatLatestUpdate(marketOffers)}</span>
            )}
          </div>

          {marketOffers === null && <p className="text-sm text-ink-faint">Загрузка…</p>}
          {marketOffers !== null && marketOffers.length === 0 && (
            <p className="text-sm text-ink-faint">Данные пока не собраны.</p>
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
              <p className="text-xs text-ink-faint">
                Цена с отделкой и без — разные рынки, поэтому не смешиваем их в одной цифре.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      <th className="py-2 pr-3 text-left">Тип помещения</th>
                      {AREA_BUCKET_ORDER.map((bucket) => (
                        <th key={bucket} className="py-2 px-2 text-right font-semibold">
                          {bucket}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {buildMarketPivot(
                      marketOffers,
                      marketDealType === 'Продажа' ? 'sale' : 'rent',
                      MARKET_FINISH_TO_DB[marketFinish],
                    ).map((row) => (
                      <tr key={row.propertyType}>
                        <td className="py-2.5 pr-3 font-medium text-ink">{row.propertyType}</td>
                        {row.cells.map((cell, i) => (
                          <td key={i} className="py-2.5 px-2 text-right tabular-nums">
                            {cell ? (
                              <>
                                <div className="font-semibold text-ink">{cell.count}</div>
                                <div className="text-xs text-ink-faint">
                                  {cell.medianPrice} $/м²{marketDealType === 'Аренда' ? '/мес' : ''}
                                </div>
                              </>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-faint">Сверху — количество предложений, снизу — медианная цена за м².</p>

              {district === 'minsk-mir' && (
                <div className="flex items-start gap-2.5 rounded-control border border-success/30 bg-success-bg px-4 py-3">
                  <Sparkles className="h-4 w-4 shrink-0 translate-y-0.5 text-success" />
                  <p className="text-sm text-ink">
                    Небольших офисов (до 40 м²) с готовой отделкой в районе почти нет:{' '}
                    <span className="font-semibold text-success">
                      {countSmallFinishedOffices(marketOffers, 'sale')} предложение на продажу
                    </span>{' '}
                    и{' '}
                    <span className="font-semibold text-success">
                      {countSmallFinishedOffices(marketOffers, 'rent')} в аренду
                    </span>{' '}
                    на весь Минск Мир. Red One закрывает именно этот дефицит —{' '}
                    <Link to="/minsk/one" className="font-semibold underline">
                      кабинеты с отделкой под ключ
                    </Link>
                    .
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
