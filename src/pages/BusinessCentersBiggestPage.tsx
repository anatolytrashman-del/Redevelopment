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
import { isOutsideMinsk, money } from '../lib/businessCenterRanking';
import { CatalogMap } from '../components/businessCenters/CatalogMap';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { nearestMetroStation } from '../lib/metroStations';
import { FaqAccordion } from '../components/ui/FaqAccordion';

const DATE_PUBLISHED = '2026-09-22';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/rating/samye-bolshie';
const PAGE_H1 = 'Самые большие бизнес-центры Минска';
const TITLE = 'Самые большие бизнес-центры Минска: топ-20 по площади';
const DESCRIPTION = `Топ-20 бизнес-центров Минска по общей площади здания: все классы, только сданные здания в черте города. Общая и офисная площадь, год постройки и метро.`;
const CLASS_EXPLAINER_URL = '/minsk/bcminsk/gid#klassy';
const nf = new Intl.NumberFormat('ru-RU');

export function BusinessCentersBiggestPage() {
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
  const eligible = useMemo(
    () =>
      (centers ?? [])
        .filter((c) => c.businessClass != null && c.status !== 'under_construction' && !isOutsideMinsk(c) && c.totalArea != null)
        .sort((a, b) => (b.totalArea ?? 0) - (a.totalArea ?? 0)),
    [centers],
  );
  const displayed = useMemo(() => eligible.slice(0, 20), [eligible]);

  const faqItems = useMemo(() => {
    if (centers === null) return [];
    const items: { question: string; answer: string }[] = [];
    items.push(
      {
        question: 'Как составлен топ-20 самых больших бизнес-центров Минска?',
        answer: `Берём сданные здания всех классов A, B+, B и C в черте Минска с заполненной общей площадью. Сортируем по убыванию общей площади, показываем не более 20. В каталоге этим условиям отвечают ${eligible.length} зданий, показано ${displayed.length}. Оценки на картах на отбор не влияют.`,
      },
      {
        question: 'Почему сравнивается общая площадь, а не офисная?',
        answer:
          'Общая площадь характеризует размер здания целиком, включая офисы и другие помещения. Офисная площадь описывает только офисную часть и заполнена не у всех зданий. Подмена общей площади офисной сделала бы сравнение неоднородным.',
      },
    );
    const leader = displayed[0];
    if (leader) {
      items.push({
        question: 'Какой бизнес-центр самый большой в этом списке?',
        answer: `«${shortName(leader)}» — ${nf.format(leader.totalArea ?? 0)} м² общей площади, класс ${leader.businessClass}.`,
      });
      if (leader.officeArea != null && leader.officeArea !== leader.totalArea) {
        items.push({
          question: 'Чем общая площадь лидера отличается от офисной?',
          answer: `У «${shortName(leader)}» общая площадь — ${nf.format(leader.totalArea ?? 0)} м², офисная — ${nf.format(leader.officeArea)} м². Это разные показатели: офисная площадь относится к офисам, общая — ко всему зданию; разница не означает наличие свободных офисов.`,
        });
      }
    }
    const withRent = displayed
      .map((center) => ({ center, snap: offerIndex.rentBySlug.get(center.slug) }))
      .filter((x): x is { center: BusinessCenter; snap: MarketSnapshot & { median: number } } => x.snap?.median != null)
      .sort((a, b) => a.snap.median - b.snap.median);
    if (withRent.length > 0)
      items.push({
        question: 'Что означают ставки аренды на карте?',
        answer: `Для ${withRent.length} зданий списка есть медианные ставки по объявлениям: от ${money(withRent[0].snap.median)} до ${money(withRent[withRent.length - 1].snap.median)}. Это цены предложения, не сделок; при выборке менее ${MIN_RELIABLE_N} объявлений ставка ориентировочная. На порядок по площади аренда не влияет.`,
      });
    const withYear = displayed.filter((c) => c.yearBuilt != null).sort((a, b) => (b.yearBuilt ?? 0) - (a.yearBuilt ?? 0));
    if (withYear.length > 0)
      items.push({
        question: 'Какие годы постройки у зданий списка?',
        answer: `Год известен для ${withYear.length} зданий. Самое новое — «${shortName(withYear[0])}», ${withYear[0].yearBuilt} год; самое старое — «${shortName(withYear[withYear.length - 1])}», ${withYear[withYear.length - 1].yearBuilt} год.`,
      });
    const withOffice = displayed.filter((c) => c.officeArea != null).sort((a, b) => (b.officeArea ?? 0) - (a.officeArea ?? 0));
    if (withOffice.length > 0 && withOffice.length < displayed.length)
      items.push({
        question: 'Для каких зданий известна офисная площадь?',
        answer: `Из ${displayed.length} зданий списка она заполнена у ${withOffice.length}: показана в ячейке «Из них офисов» и не влияет на место.`,
      });
    if (withOffice.length === displayed.length && withOffice.length > 0) {
      const mostOffice = withOffice[0];
      const leastOffice = withOffice[withOffice.length - 1];
      items.push({
        question: 'У каких зданий списка больше всего и меньше всего офисных площадей?',
        answer: `Офисная площадь известна у всех ${displayed.length} зданий списка: больше всего у «${shortName(mostOffice)}» — ${nf.format(mostOffice.officeArea ?? 0)} м², меньше всего у «${shortName(leastOffice)}» — ${nf.format(leastOffice.officeArea ?? 0)} м². Она показана в ячейке «Из них офисов» и не влияет на место в списке.`,
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
  }, [centers, displayed, offerIndex, eligible]);

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
              <li>Известна общая площадь здания; сортировка по её убыванию</li>
              <li>
                Топ-20: показано {displayed.length} из {eligible.length} зданий с известной площадью
              </li>
            </ol>
          </div>
        </div>

        {centers === null && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {centers !== null && (
          <div className="flex flex-col gap-3">
            {displayed.length === 0 && <p className="p-4 text-sm text-ink-muted">Пока нет зданий, отвечающих условиям списка.</p>}
            {displayed.map((center, i) => {
              const nearestMetro = nearestMetroStation(center.nearestMetroStations ?? []);
              return (
                <RankingRow
                  key={center.slug}
                  center={center}
                  place={i + 1}
                  cells={
                    <>
                      <Cell label="Класс">Класс {center.businessClass}</Cell>
                      <Cell label="Площадь">
                        {nf.format(center.totalArea ?? 0)}
                        <span className="font-medium text-ink-muted"> м²</span>
                      </Cell>
                      {center.officeArea != null && (
                        <Cell label="Из них офисов">
                          {nf.format(center.officeArea)}
                          <span className="font-medium text-ink-muted"> м²</span>
                        </Cell>
                      )}
                      {center.yearBuilt != null && <Cell label="Год постройки">{center.yearBuilt}</Cell>}
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
            <li>
              <Link to="/minsk/bcminsk/rating/samye-dostupnye" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Самые доступные бизнес-центры Минска с рейтингом от 4,5
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
