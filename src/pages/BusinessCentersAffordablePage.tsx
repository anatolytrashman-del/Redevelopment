import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd, setItemListJsonLd } from '../lib/pageMeta';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import { fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';
import { buildOfferIndex, EMPTY_OFFER_INDEX } from '../lib/businessCenterCatalogFilter';
import type { BusinessCenter } from '../data/businessCenters';
import { shortName } from '../lib/businessCenterDisplay';
import { Cell, RankingRow } from '../components/businessCenters/RankingRow';
import {
  RATING_THRESHOLD_LABEL,
  MIN_RATING_COUNT,
  ratingsCount,
  money,
  rentLabel,
  buildRankingForClasses,
} from '../lib/businessCenterRanking';
import { CatalogMap } from '../components/businessCenters/CatalogMap';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { nearestMetroStation } from '../lib/metroStations';
import { FaqAccordion } from '../components/ui/FaqAccordion';

const DATE_PUBLISHED = '2026-09-22';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/rating/samye-dostupnye';
const PAGE_H1 = 'Самые доступные бизнес-центры Минска с рейтингом от 4,5';
const TITLE = 'Самые доступные бизнес-центры Минска с рейтингом от 4,5';
const DESCRIPTION = `Медианные ставки аренды в бизнес-центрах Минска всех классов с рейтингом Яндекс.Карт от ${RATING_THRESHOLD_LABEL} и не менее ${MIN_RATING_COUNT} оценок. Сортировка от доступных к дорогим.`;
const CLASS_EXPLAINER_URL = '/minsk/bcminsk/gid#klassy';
const nf = new Intl.NumberFormat('ru-RU');

export function BusinessCentersAffordablePage() {
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [snapshots, setSnapshots] = useState<MarketSnapshot[] | null>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
    fetchLatestMarketSnapshots('ofisy_bc')
      .then(setSnapshots)
      .catch(() => setSnapshots([]));
  }, []);

  const offerIndex = useMemo(() => (snapshots ? buildOfferIndex(snapshots) : EMPTY_OFFER_INDEX), [snapshots]);
  const ranking = useMemo(
    () =>
      buildRankingForClasses(centers ?? [], ['A', 'B+', 'B', 'C'])
        .filter((r) => offerIndex.rentBySlug.get(r.center.slug)?.median != null)
        .sort((a, b) => (offerIndex.rentBySlug.get(a.center.slug)?.median ?? 0) - (offerIndex.rentBySlug.get(b.center.slug)?.median ?? 0)),
    [centers, offerIndex],
  );
  const displayed = useMemo(() => ranking.map((r) => r.center), [ranking]);

  const faqItems = useMemo(() => {
    if (centers === null || snapshots === null) return [];
    const items: { question: string; answer: string }[] = [];
    items.push({
      question: 'По какой методике составлен рейтинг?',
      answer: `Все классы A, B+, B и C; только сданные здания в черте Минска, рейтинг Яндекс.Карт от ${RATING_THRESHOLD_LABEL} из 5 и не менее ${MIN_RATING_COUNT} оценок здания. Затем оставляем здания с медианной ставкой аренды и сортируем по её возрастанию. Два условия нужны, чтобы низкая цена сама по себе не выводила в список плохо оценённое здание. Оценка относится к зданию целиком, а не только к офисам.`,
    });
    items.push({
      question: 'Сколько бизнес-центров попало в список?',
      answer: `Оба условия — рейтинг и наличие медианной ставки аренды — выполнили ${ranking.length} бизнес-центров.`,
    });
    if (ranking.length > 0) {
      const byCount = [...ranking].sort((a, b) => b.ratingCount - a.ratingCount);
      items.push({
        question: 'Сколько оценок у зданий в списке?',
        answer: `От ${ratingsCount(byCount[byCount.length - 1].ratingCount)} до ${ratingsCount(byCount[0].ratingCount)}. Больше всего у «${shortName(byCount[0].center)}». Оценки оставляют все посетители здания, включая посетителей магазинов и кафе, поэтому это не отдельная оценка офисной части.`,
      });
    }
    const withRent = displayed
      .map((center) => ({ center, snap: offerIndex.rentBySlug.get(center.slug) }))
      .filter((x): x is { center: BusinessCenter; snap: MarketSnapshot & { median: number } } => x.snap?.median != null)
      .sort((a, b) => a.snap.median - b.snap.median);
    if (withRent.length > 0) {
      const cheapest = withRent[0];
      const priciest = withRent[withRent.length - 1];
      items.push({
        question: 'Где самая доступная и самая высокая аренда в списке?',
        answer: `Самая низкая медиана — ${money(cheapest.snap.median)} у «${shortName(cheapest.center)}» (${cheapest.snap.n} объявл.), самая высокая — ${money(priciest.snap.median)} у «${shortName(priciest.center)}» (${priciest.snap.n} объявл.). Это запрашиваемые ставки из объявлений, не цены сделок. Число объявлений указано в каждой строке со ставкой.`,
      });
    }
    const approximate = withRent.filter((x) => x.snap.n < MIN_RELIABLE_N);
    if (approximate.length > 0 && approximate.length <= 5)
      items.push({
        question: 'Что означает «ориент.» рядом с арендой?',
        answer: `При выборке менее ${MIN_RELIABLE_N} объявлений медиана ориентировочная. В этом списке таких зданий ${approximate.length}: ${approximate.map((x) => `«${shortName(x.center)}» — ${x.snap.n} объявл.`).join('; ')}. Малое число объявлений не позволяет считать ставку устойчивой.`,
      });
    if (approximate.length > 5)
      items.push({
        question: 'Что означает «ориент.» рядом с арендой?',
        answer: `При выборке менее ${MIN_RELIABLE_N} объявлений медиана ориентировочная — это помечено в самой ячейке со ставкой. Из ${withRent.length} зданий списка со ставкой аренды таких ${approximate.length}: выборка по ним от 1 до ${Math.max(...approximate.map((x) => x.snap.n))} объявлений. Малое число объявлений не позволяет считать ставку устойчивой.`,
      });
    const withYear = displayed.filter((c) => c.yearBuilt != null).sort((a, b) => (b.yearBuilt ?? 0) - (a.yearBuilt ?? 0));
    if (withYear.length > 0)
      items.push({
        question: 'Какие годы постройки у зданий списка?',
        answer: `Год известен для ${withYear.length} зданий. Самое новое — «${shortName(withYear[0])}», ${withYear[0].yearBuilt} год; самое старое — «${shortName(withYear[withYear.length - 1])}», ${withYear[withYear.length - 1].yearBuilt} год.`,
      });
    const withArea = displayed.filter((c) => (c.officeArea ?? c.totalArea) != null);
    if (withArea.length > 0)
      items.push({
        question: 'Какая площадь показана в строках?',
        answer: `Площадь известна для ${withArea.length} зданий списка. «Офисов» — офисная площадь; если она не указана, показываем общую под подписью «Площадь». Например, у «${shortName(withArea[0])}» — ${nf.format(withArea[0].officeArea ?? withArea[0].totalArea ?? 0)} м² (${withArea[0].officeArea != null ? 'офисная' : 'общая'}). Эти цифры не означают площадь свободных помещений.`,
      });
    const withMetro = displayed.flatMap((center) => {
      const metro = nearestMetroStation(center.nearestMetroStations ?? []);
      return metro ? [{ center, metro }] : [];
    });
    if (withMetro.length > 0 && withMetro.length <= 5)
      items.push({
        question: 'У каких станций метро находятся здания списка?',
        answer:
          withMetro.map(({ center, metro }) => `«${shortName(center)}» — ${metro.name}`).join('; ') +
          '. Указана ближайшая из известных станций; это не оценка времени пешком.',
      });
    if (withMetro.length > 5) {
      const stationCounts = new Map<string, number>();
      for (const { metro } of withMetro) stationCounts.set(metro.name, (stationCounts.get(metro.name) ?? 0) + 1);
      const topStation = [...stationCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      items.push({
        question: 'У каких станций метро находятся здания списка?',
        answer:
          `Ближайшая станция известна у ${withMetro.length} из ${displayed.length} зданий списка, всего это ${stationCounts.size} ` +
          `${stationCounts.size === 1 ? 'станция' : 'станций'}${topStation && topStation[1] > 1 ? `, больше всего зданий — у станции «${topStation[0]}» (${topStation[1]})` : ''}. ` +
          'Она указана рядом с каждым зданием и в списке — это ближайшая из известных станций, а не оценка времени пешком.',
      });
    }
    if (displayed.length > 0)
      items.push({
        question: 'Где посмотреть адреса и расположение зданий?',
        answer: `Адрес указан под названием каждого БЦ; нажатие на строку открывает его карточку. Кнопка «Показать ${displayed.length} БЦ рейтинга на карте» загружает карту Яндекса с выбранными зданиями; метки доступны для объектов с координатами.`,
      });
    items.push({
      question: 'Как часто обновляется список?',
      answer:
        'Список пересчитывается из загруженного каталога и последних месячных снимков объявлений при открытии страницы. Изменения характеристик здания, сохранённых оценок карт и ставок отражаются после обновления исходных данных; это не прямой эфир Яндекс.Карт.',
    });
    return items;
  }, [centers, snapshots, displayed, offerIndex, ranking]);

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
      { name: 'Бизнес-центры Минска', url: 'https://redevelopment.pro/minsk/bcminsk' },
      { name: PAGE_H1 },
    ]);
  }, []);

  useEffect(() => {
    setItemListJsonLd(
      displayed.map((center) => ({ name: shortName(center), url: `https://redevelopment.pro/minsk/bcminsk/${center.slug}` })),
    );
    setFaqJsonLd(faqItems);
  }, [displayed, faqItems]);

  return (
    <div className="min-h-svh bg-bg">
      <CatalogTopNav centers={centers} width="max-w-3xl" />

      <main data-menu-align className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <Link to="/minsk" className="hover:text-ink">
            Минск
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/minsk/bcminsk" className="hover:text-ink">
            Бизнес-центры
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{PAGE_H1}</span>
        </nav>
        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 shrink-0 text-primary-hover" />
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
          </div>
          <div className="text-xs text-ink-muted">
            <strong className="text-ink">Методика оценки:</strong>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-ink">
              <li>
                Все классы: A, B+, B и C (
                <Link to={CLASS_EXPLAINER_URL} className="font-semibold text-primary-hover hover:underline">
                  как определяется класс
                </Link>
                )
              </li>
              <li>Только сданные здания в черте Минска</li>
              <li>Рейтинг от {RATING_THRESHOLD_LABEL} на Яндекс.Картах</li>
              <li>Не менее {MIN_RATING_COUNT} оценок здания</li>
              <li>Есть медианная ставка аренды по объявлениям; сортировка от самой низкой ставки</li>
            </ol>
          </div>
        </div>

        {(centers === null || snapshots === null) && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {centers !== null && snapshots !== null && (
          <div className="flex flex-col gap-3">
            {displayed.length === 0 && <p className="p-4 text-sm text-ink-muted">Пока нет зданий, отвечающих условиям списка.</p>}
            {ranking.map((r, i) => {
              const center = r.center;
              const nearestMetro = nearestMetroStation(center.nearestMetroStations ?? []);
              const rentCell = rentLabel(offerIndex.rentBySlug.get(center.slug));
              const area = center.officeArea ?? center.totalArea;
              return (
                <RankingRow
                  key={center.slug}
                  center={center}
                  place={i + 1}
                  cells={
                    <>
                      <Cell label="Класс">Класс {center.businessClass}</Cell>
                      <Cell label="Рейтинг">
                        ★ {r.ratingLabel}
                        <span className="font-medium text-ink-muted"> · {ratingsCount(r.ratingCount)}</span>
                      </Cell>
                      {rentCell && (
                        <Cell label={rentCell.label}>
                          <span className="text-success">{rentCell.value}</span>
                        </Cell>
                      )}
                      {area != null && (
                        <Cell label={center.officeArea != null ? 'Офисов' : 'Площадь'}>
                          {nf.format(area)}
                          <span className="font-medium text-ink-muted"> м²</span>
                        </Cell>
                      )}
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
              <CatalogMap centers={displayed} offers={offerIndex} heightClass="h-[30vh] min-h-[220px]" />
            ) : (
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className={cn('flex flex-col items-center gap-1 p-8 text-center transition-colors hover:border-primary/40', glassCardClass)}
                style={glassCardShadow}
              >
                <span className="text-sm font-bold text-ink">Показать {displayed.length} БЦ рейтинга на карте</span>
                <span className="text-xs text-ink-muted">Карта Яндекса грузится отдельно, чтобы не замедлять страницу</span>
              </button>
            )}
          </div>
        )}

        <FaqAccordion title="Частые вопросы" items={faqItems} id="faq" />

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Ещё по бизнес-центрам Минска</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/minsk/bcminsk" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Полный каталог бизнес-центров Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/rating" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Лучшие бизнес-центры Минска: класс A
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/rating/samye-bolshie" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Самые большие бизнес-центры Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/rating/b-plus" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Лучшие бизнес-центры класса B+ в Минске
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/rating/b-c" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Лучшие бизнес-центры классов B и C в Минске
              </Link>
            </li>
          </ul>
        </div>
        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Источники</h2>
          <SourcesTrademarkNote />
        </div>
      </main>
    </div>
  );
}
