import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd, setItemListJsonLd } from '../lib/pageMeta';
import { catalogSiteUrl } from '../lib/sites';
import { fetchBusinessCenters, snapshotBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import type { BusinessCenter } from '../data/businessCenters';
import { shortName } from '../lib/businessCenterDisplay';
import { Cell, RankingRow } from '../components/businessCenters/RankingRow';
import { CatalogMap } from '../components/businessCenters/CatalogMap';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { nearestMetroStation } from '../lib/metroStations';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { EMPTY_OFFER_INDEX } from '../lib/businessCenterCatalogFilter';
import { buildTcLargest, buildTcLargestEligible, TC_LARGEST_LIMIT } from '../lib/tradeCenterRanking';
import { tcTopicHubUrl, TC_TOPIC_HUBS } from '../lib/tradeCenterHubs';

const DATE_PUBLISHED = '2026-10-04';
const PAGE_URL = `${catalogSiteUrl('tc')}/rating/largest`;
const PAGE_H1 = 'Самые большие торговые центры Минска';
const TITLE = 'Самые большие торговые центры Минска: топ-10 по площади';
const DESCRIPTION =
  'Топ-10 торговых центров Минска по общей площади здания: только сданные объекты в черте города. Площадь, формат, год и метро.';

const nf = new Intl.NumberFormat('ru-RU');

export function TradeCentersBiggestPage() {
  const [centers, setCenters] = useState<BusinessCenter[] | null>(() => snapshotBusinessCenters('tc'));
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    fetchBusinessCenters('tc')
      .then(setCenters)
      .catch(() => setCenters((prev) => prev ?? []));
  }, []);

  const eligible = useMemo(() => (centers ? buildTcLargestEligible(centers) : []), [centers]);
  const displayed = useMemo(() => buildTcLargest(centers ?? [], TC_LARGEST_LIMIT), [centers]);

  const faqItems = useMemo(() => {
    if (centers === null) return [];
    const items: { question: string; answer: string }[] = [];
    items.push({
      question: 'Как составлен топ самых больших торговых центров Минска?',
      answer: `Берём сданные торговые центры в черте Минска с заполненной общей площадью. Сортируем по убыванию общей площади, показываем топ-${TC_LARGEST_LIMIT}. В каталоге этим условиям отвечают ${eligible.length} объектов, в списке — ${displayed.length}. Оценки на картах на отбор не влияют.`,
    });
    const leader = displayed[0];
    if (leader) {
      items.push({
        question: 'Какой торговый центр самый большой в этом списке?',
        answer: `«${shortName(leader)}» — ${nf.format(leader.totalArea ?? 0)} м² общей площади${leader.retailFormat ? `, формат «${leader.retailFormat}»` : ''}.`,
      });
    }
    const withYear = displayed.filter((c) => c.yearBuilt != null).sort((a, b) => (b.yearBuilt ?? 0) - (a.yearBuilt ?? 0));
    if (withYear.length > 0) {
      items.push({
        question: 'Какие годы постройки у зданий списка?',
        answer: `Год известен для ${withYear.length} объектов. Самое новое — «${shortName(withYear[0])}», ${withYear[0].yearBuilt} год; самое старое — «${shortName(withYear[withYear.length - 1])}», ${withYear[withYear.length - 1].yearBuilt} год.`,
      });
    }
    const withMetro = displayed.flatMap((center) => {
      const metro = nearestMetroStation(center.nearestMetroStations ?? []);
      return metro ? [{ center, metro }] : [];
    });
    if (withMetro.length > 0) {
      const stationCounts = new Map<string, number>();
      for (const { metro } of withMetro) stationCounts.set(metro.name, (stationCounts.get(metro.name) ?? 0) + 1);
      const topStation = [...stationCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      items.push({
        question: 'У каких станций метро находятся здания списка?',
        answer:
          `Ближайшая станция известна у ${withMetro.length} из ${displayed.length} объектов, всего это ${stationCounts.size} ` +
          `${stationCounts.size === 1 ? 'станция' : 'станций'}${topStation && topStation[1] > 1 ? `, больше всего — у станции «${topStation[0]}» (${topStation[1]})` : ''}.`,
      });
    }
    if (displayed.length > 0) {
      items.push({
        question: 'Где посмотреть адреса и расположение?',
        answer: `Адрес указан под названием каждого ТЦ; нажатие на строку открывает карточку. Кнопка «Показать на карте» загружает карту Яндекса с объектами списка.`,
      });
    }
    items.push({
      question: 'Как часто обновляется список?',
      answer:
        'Список пересчитывается из каталога при открытии страницы. Изменения площади и состава каталога отражаются после обновления исходных данных.',
    });
    return items;
  }, [centers, displayed, eligible]);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL, ogType: 'article' });
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      datePublished: DATE_PUBLISHED,
      dateModified: new Date().toISOString().slice(0, 10),
    });
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Торговые центры Минска', url: catalogSiteUrl('tc') },
      { name: PAGE_H1 },
    ]);
  }, []);

  useEffect(() => {
    setItemListJsonLd(displayed.map((center) => ({ name: shortName(center), url: `${catalogSiteUrl('tc')}/${center.slug}` })));
    setFaqJsonLd(faqItems);
  }, [displayed, faqItems]);

  const shoppingHub = TC_TOPIC_HUBS.find((h) => h.slug === 'shopping');

  return (
    <div className="min-h-svh bg-bg">
      <CatalogTopNav centers={centers} width="max-w-3xl" />

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <Link to="/minsk" className="hover:text-ink">
            Минск
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/minsk/tc" className="hover:text-ink">
            Торговые центры
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{PAGE_H1}</span>
        </nav>
        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 shrink-0 text-icon" />
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
          </div>
          <div className="text-xs text-ink-muted">
            <strong className="text-ink">Методика оценки:</strong>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-ink">
              <li>Только сданные торговые центры в черте Минска</li>
              <li>Известна общая площадь здания; сортировка по её убыванию</li>
              <li>
                Топ-{TC_LARGEST_LIMIT}: показано {displayed.length} из {eligible.length} объектов с известной площадью
              </li>
            </ol>
          </div>
        </div>

        {centers === null && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {centers !== null && (
          <div className="flex flex-col gap-3">
            {displayed.length === 0 && <p className="p-4 text-sm text-ink-muted">Пока нет объектов, отвечающих условиям списка.</p>}
            {displayed.map((center, i) => {
              const nearestMetro = nearestMetroStation(center.nearestMetroStations ?? []);
              return (
                <RankingRow
                  key={center.slug}
                  center={center}
                  place={i + 1}
                  basePath="/minsk/tc"
                  cells={
                    <>
                      <Cell label="Площадь">
                        {nf.format(center.totalArea ?? 0)}
                        <span className="font-medium text-ink-muted"> м²</span>
                      </Cell>
                      {center.retailFormat && <Cell label="Формат">{center.retailFormat}</Cell>}
                      {center.yearBuilt != null && <Cell label="Год">{center.yearBuilt}</Cell>}
                      {nearestMetro && <Cell label="Метро">{nearestMetro.name}</Cell>}
                    </>
                  }
                />
              );
            })}
          </div>
        )}

        {displayed.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-ink">Где они находятся</h2>
            {showMap ? (
              <CatalogMap centers={displayed} offers={EMPTY_OFFER_INDEX} heightClass="h-[30vh] min-h-[220px]" />
            ) : (
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className={cn('flex flex-col items-center gap-1 p-8 text-center transition-colors hover:border-primary/40', glassCardClass)}
                style={glassCardShadow}
              >
                <span className="text-sm font-bold text-ink">Показать {displayed.length} ТЦ рейтинга на карте</span>
                <span className="text-xs text-ink-muted">Карта Яндекса грузится отдельно, чтобы не замедлять страницу</span>
              </button>
            )}
          </div>
        )}

        <FaqAccordion title="Частые вопросы" items={faqItems} id="faq" />

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Ещё по торговым центрам Минска</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/minsk/tc" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Полный каталог торговых центров Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/tc/rating" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Лучшие торговые центры Минска
              </Link>
            </li>
            {shoppingHub && (
              <li>
                <Link to={tcTopicHubUrl(shoppingHub)} className="flex items-center gap-2 text-ink hover:text-primary-hover">
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  {shoppingHub.title}
                </Link>
              </li>
            )}
          </ul>
        </div>

        <SourcesTrademarkNote />
      </main>
    </div>
  );
}
