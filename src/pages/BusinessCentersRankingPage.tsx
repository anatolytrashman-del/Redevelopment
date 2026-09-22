import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd, setItemListJsonLd } from '../lib/pageMeta';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import { fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { buildOfferIndex, EMPTY_OFFER_INDEX } from '../lib/businessCenterCatalogFilter';
import type { BusinessCenter } from '../data/businessCenters';
import { shortName } from '../lib/businessCenterDisplay';
import { Cell, RankingRow } from '../components/businessCenters/RankingRow';
import { RATING_THRESHOLD_LABEL, MIN_RATING_COUNT, isOutsideMinsk, ratingsCount, money, rentLabel, buildRankingForClasses, buildExcludedForClasses, type RankedCenter, type ExcludedCenter } from '../lib/businessCenterRanking';
import { CatalogMap } from '../components/businessCenters/CatalogMap';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { nearestMetroStation } from '../lib/metroStations';
import { FaqAccordion } from '../components/ui/FaqAccordion';

// Рейтинг «Лучшие бизнес-центры Минска» (аудит поиска 2026-09-07: подсказка
// Google «Лучшие бизнес-центры Минска» — «рейтинг с методикой и датой»).
// Владелец (2026-09-07): «поменял бы концепт этой страницы и поставил в
// выдачу только БЦ класса А с рейтингом выше 4.5».
//
// Переработка 2026-09-22 по разбору страницы (docs/bc-ranking-page-plan.md;
// страница держит #2 в Яндексе по «лучшие бизнес-центры минска», поэтому
// разбирали её отдельно). Что изменилось в МЕТОДИКЕ:
//   1) добавлено третье условие — не менее 50 оценок здания. Без него
//      «Проспект» с рейтингом 4,9 по 46 оценкам стоял ВЫШЕ А1 с 4,8 по 399
//      и «Имперского» с 4,8 по 583: на такой выборке 4,9 и 4,3 неразличимы;
//   2) при равном рейтинге выше тот, у кого БОЛЬШЕ ОЦЕНОК (было — по общей
//      площади, то есть «лучше» молча значило «больше»);
//   3) только здания в черте Минска. На проде 4-м местом в «Лучших
//      бизнес-центрах Минска» стоял «Аден» — бизнес-отель в индустриальном
//      парке «Великий камень», ~25 км от города.
// Само число оценок теперь видно в каждой строке: это единственное, по чему
// читатель может понять, чему верить (mapRatingFromHighlights.count).
const DATE_PUBLISHED = '2026-09-07';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/rating';
const TITLE = `Лучшие бизнес-центры Минска: рейтинг класса A с оценкой от ${RATING_THRESHOLD_LABEL}`;
// 160 символов — бюджет сниппета, см. комментарий в BusinessCentersGuidePage.
const DESCRIPTION =
  `Рейтинг бизнес-центров Минска: класс A, оценка на Яндекс.Картах от ${RATING_THRESHOLD_LABEL} из 5 ` +
  `при ${MIN_RATING_COUNT}+ отзывах. Открытая методика и медианная ставка аренды по каждому БЦ.`;
const PAGE_H1 = 'Лучшие бизнес-центры Минска';
// Раздел «Классы A, B+, B и C» в гиде по бизнес-центрам — туда ведёт
// «как определяется класс» из методики (владелец, 2026-09-22).
const CLASS_EXPLAINER_URL = '/minsk/bcminsk/gid#klassy';

export type { RankedCenter, ExcludedCenter } from '../lib/businessCenterRanking';

export function buildRanking(centers: BusinessCenter[]): RankedCenter[] {
  return buildRankingForClasses(centers, ['A']);
}

export function buildExcluded(centers: BusinessCenter[]): ExcludedCenter[] {
  return buildExcludedForClasses(centers, ['A']);
}

const nf = new Intl.NumberFormat('ru-RU');

function RatedRankingRow({
  ranked,
  place,
  rent,
}: {
  ranked: RankedCenter;
  place: number;
  rent: MarketSnapshot | undefined;
}) {
  const { center, ratingLabel, ratingCount } = ranked;
  const nearestMetro = nearestMetroStation(center.nearestMetroStations ?? []);
  const area = center.officeArea ?? center.totalArea;
  const areaLabel = center.officeArea != null ? 'Офисов' : 'Площадь';
  const rentCell = rentLabel(rent);
  return (
    <RankingRow
      center={center}
      place={place}
      cells={
        <>
          <Cell label="Рейтинг">
            ★ {ratingLabel}
            <span className="font-medium text-ink-muted"> · {ratingsCount(ratingCount)}</span>
          </Cell>
          {rentCell && (
            <Cell label={rentCell.label}>
              <span className="text-success">{rentCell.value}</span>
            </Cell>
          )}
          {area != null && (
            <Cell label={areaLabel}>
              {nf.format(area)}
              <span className="font-medium text-ink-muted"> м²</span>
            </Cell>
          )}
          {nearestMetro && <Cell label="Метро">{nearestMetro.name}</Cell>}
        </>
      }
    />
  );
}

export function BusinessCentersRankingPage() {
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

  const ranking = useMemo(() => (centers ? buildRanking(centers) : []), [centers]);
  const excluded = useMemo(() => (centers ? buildExcluded(centers) : []), [centers]);
  const offerIndex = useMemo(() => (snapshots ? buildOfferIndex(snapshots) : EMPTY_OFFER_INDEX), [snapshots]);
  const classATotal = useMemo(
    () => (centers ?? []).filter((c) => c.businessClass === 'A' && c.status !== 'under_construction' && !isOutsideMinsk(c)).length,
    [centers],
  );
  const bPlusCount = useMemo(() => (centers ? buildRankingForClasses(centers, ['B+']).length : 0), [centers]);
  const bCount = useMemo(() => (centers ? buildRankingForClasses(centers, ['B', 'C']).length : 0), [centers]);

  const faqItems = useMemo(() => {
    if (ranking.length === 0) return [];
    const leader = ranking[0];
    const byCount = [...ranking].sort((a, b) => b.ratingCount - a.ratingCount);
    const mostRated = byCount[0];
    const leastRated = byCount[byCount.length - 1];
    const withRent = ranking
      .map((r) => ({ r, snap: offerIndex.rentBySlug.get(r.center.slug) }))
      .filter((x): x is { r: RankedCenter; snap: MarketSnapshot } => x.snap != null && x.snap.median != null)
      .sort((a, b) => (a.snap.median ?? 0) - (b.snap.median ?? 0));
    const withYear = ranking.filter((r) => r.center.yearBuilt != null).sort((a, b) => (b.center.yearBuilt ?? 0) - (a.center.yearBuilt ?? 0));

    const items: { question: string; answer: string }[] = [
      {
        question: 'По какой методике составлен этот рейтинг?',
        answer:
          `Три проверяемых условия: бизнес-центр класса A, рейтинг на Яндекс.Картах не ниже ${RATING_THRESHOLD_LABEL} из 5 и ` +
          `не менее ${MIN_RATING_COUNT} оценок здания. Внутри списка — по рейтингу, при равном рейтинге выше тот, у кого больше ` +
          'оценок. Субъективных оценок и скрытых весов в методике нет, все три условия можно проверить самому.',
      },
      {
        question: 'Какой бизнес-центр класса A в Минске с самым высоким рейтингом?',
        answer: `«${shortName(leader.center)}» — ${leader.ratingLabel} из 5 на Яндекс.Картах, и это ${ratingsCount(leader.ratingCount)}.`,
      },
      {
        question: 'Сколько бизнес-центров попало в рейтинг?',
        answer:
          `${ranking.length} из ${classATotal} сданных бизнес-центров класса A в Минске. ` +
          (excluded.length > 0
            ? `Не попали: ${excluded.map((e) => `«${shortName(e.center)}» — ${e.reason}`).join('; ')}.`
            : ''),
      },
    ];

    if (mostRated && leastRated && mostRated.ratingCount > leastRated.ratingCount * 3) {
      items.push({
        question: 'Почему у одних бизнес-центров тысячи оценок, а у других — сотня?',
        answer:
          `Например, у БЦ «${shortName(mostRated.center)}» — ${ratingsCount(mostRated.ratingCount)}, а у БЦ ` +
          `«${shortName(leastRated.center)}» — ${ratingsCount(leastRated.ratingCount)}. ` +
          'Оценку на картах ставят все посетители здания, а не только его арендаторы: чем больше в здании магазинов, кафе, ' +
          'фитнеса и прочих организаций, тем больше оценок. Поэтому рейтинг Яндекс.Карт — это оценка здания целиком, а не ' +
          `офисной части отдельно, и порог в ${MIN_RATING_COUNT} оценок нужен ровно для того, чтобы не сравнивать высокий балл ` +
          'по нескольким десяткам отзывов с таким же баллом по тысячам.',
      });
    }

    if (withRent.length >= 2) {
      const cheapest = withRent[0];
      const priciest = withRent[withRent.length - 1];
      items.push({
        question: 'Сколько стоит аренда в этих бизнес-центрах?',
        answer:
          `По действующим объявлениям медиана ставки — от ${money(cheapest.snap.median ?? 0)} (БЦ «${shortName(cheapest.r.center)}») ` +
          `до ${money(priciest.snap.median ?? 0)} (БЦ «${shortName(priciest.r.center)}»). Это запрашиваемые ставки из объявлений, а не ` +
          'цена сделки; по зданию их обычно единицы, поэтому рядом с каждой цифрой указано, по скольким объявлениям она ' +
          'посчитана.',
      });
    }

    if (withYear.length >= 2) {
      const newest = withYear[0];
      const oldest = withYear[withYear.length - 1];
      items.push({
        question: 'Какой бизнес-центр класса A самый новый?',
        answer: `«${shortName(newest.center)}» — ${newest.center.yearBuilt} год. Самый старый в списке — «${shortName(oldest.center)}», ${oldest.center.yearBuilt} год.`,
      });
    }

    items.push({
      question: 'Почему в рейтинге нет зданий класса B+, B и C?',
      answer:
        'Рейтинг нарочно ограничен высшим классом A — самым качественным по инженерии, отделке и расположению. ' +
        (bPlusCount > 0 || bCount > 0
          ? `Тем же трём условиям в других классах отвечают ${bPlusCount} бизнес-центров класса B+ и ${bCount} классов B и C — ` +
            'их рейтинги опубликованы на отдельных страницах. '
          : '') +
        'Все бизнес-центры Минска, включая другие классы, — в полном каталоге на странице «Бизнес-центры Минска».',
    });

    items.push({
      question: 'Как часто обновляется рейтинг?',
      answer:
        'Список не составлен руками один раз: он пересчитывается из каталога при каждом открытии страницы — меняется ' +
        'рейтинг здания на картах или ставка в объявлениях, меняется и страница.',
    });

    return items;
  }, [ranking, excluded, classATotal, offerIndex, bPlusCount, bCount]);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL, ogType: 'article' });
    // dateModified — дата сборки, а не константа: список пересчитывается из
    // базы, и на проде страница пересобирается вместе с ней (раньше здесь
    // стояло 2026-09-07 и разъезжалось с фактическим содержимым).
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
      { name: 'Рейтинг' },
    ]);
  }, []);

  useEffect(() => {
    if (ranking.length === 0) return;
    setItemListJsonLd(ranking.map((r) => ({ name: shortName(r.center), url: `https://redevelopment.pro/minsk/bcminsk/${r.center.slug}` })));
    setFaqJsonLd(faqItems);
  }, [ranking, faqItems]);

  return (
    <div className="min-h-svh bg-bg">
      <CatalogTopNav centers={centers} width="max-w-3xl" />

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <Link to="/minsk" className="hover:text-ink">
            Минск
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/minsk/bcminsk" className="hover:text-ink">
            Бизнес-центры
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">Рейтинг</span>
        </nav>

        {/* Оформление главного блока владелец попросил сохранить как было
            (2026-09-22: «сохрани дизайн главного блока, не по содержанию, а
            по оформлению») — иконка с H1 и вложенная рамка с методикой.
            Изменилось только содержимое: абзац-лид убран, методика стала
            коротким списком из трёх условий вместо абзаца текста. */}
        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 shrink-0 text-primary-hover" />
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
          </div>
          {/* Владелец, 2026-09-22: «белая подложка под методикой лишняя» —
              список условий идёт прямо в главной карточке, без вложенной
              рамки. Сам блок (иконка + H1 + методика) оформлением остался
              прежним, как он и просил. */}
          <div className="text-xs text-ink-muted">
            <strong className="text-ink">Методика оценки:</strong>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-ink">
              <li>
                Только бизнес-центры класса A (
                <Link to={CLASS_EXPLAINER_URL} className="font-semibold text-primary-hover hover:underline">
                  как определяется класс
                </Link>
                )
              </li>
              <li>Рейтинг от {RATING_THRESHOLD_LABEL} на Яндекс.Картах</li>
              <li>Не менее {MIN_RATING_COUNT} оценок здания</li>
            </ol>
          </div>
        </div>

        {centers === null && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {centers !== null && (
          <div className="flex flex-col gap-3">
            {ranking.length === 0 && (
              <p className="p-4 text-sm text-ink-muted">
                Пока ни один бизнес-центр не набрал рейтинг {RATING_THRESHOLD_LABEL} и выше при {MIN_RATING_COUNT} и более оценках.
              </p>
            )}
            {ranking.map((r, i) => (
              <RatedRankingRow key={r.center.slug} ranked={r} place={i + 1} rent={offerIndex.rentBySlug.get(r.center.slug)} />
            ))}
          </div>
        )}

        {ranking.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-ink">Где они находятся</h2>
            {/* CatalogMap рисует СВОЮ стеклянную карточку — заворачивать её
                во вторую нельзя. Монтируется по клику: API Яндекс.Карт весит
                ~689 КиБ и 2+ с CPU (PAGESPEED_PLAN.md), тянуть его на каждый
                заход ради блока внизу страницы незачем — в каталоге по той же
                причине карта грузится только при выборе вида «карта». */}
            {showMap ? (
              <CatalogMap
                centers={ranking.map((r) => r.center)}
                offers={offerIndex}
                heightClass="h-[30vh] min-h-[220px]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className={cn(
                  'flex flex-col items-center gap-1 p-8 text-center transition-colors hover:border-primary/40',
                  glassCardClass,
                )}
                style={glassCardShadow}
              >
                <span className="text-sm font-bold text-ink">Показать {ranking.length} БЦ рейтинга на карте</span>
                <span className="text-xs text-ink-muted">Карта Яндекса грузится отдельно, чтобы не замедлять страницу</span>
              </button>
            )}
          </div>
        )}

        {(bPlusCount > 0 || bCount > 0) && (
          <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Рейтинги по остальным классам</h2>
            <p className="text-sm text-ink-muted">
              Класс A — это {classATotal} сданных зданий из всего каталога. Тем же трём условиям отвечают и здания классов
              B+, B и C: для них опубликованы отдельные рейтинги с той же методикой.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {bPlusCount > 0 && (
                <Link
                  to="/minsk/bcminsk/rating/b-plus"
                  className="rounded-control border border-border bg-surface p-4 transition-colors hover:border-primary/40"
                >
                  <span className="text-2xl font-extrabold text-ink">{bPlusCount}</span>
                  <span className="mt-1 block text-sm font-bold text-ink">
                    БЦ класса B+ с рейтингом от {RATING_THRESHOLD_LABEL}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">Рейтинг бизнес-центров класса B+ →</span>
                </Link>
              )}
              {bCount > 0 && (
                <Link
                  to="/minsk/bcminsk/rating/b-c"
                  className="rounded-control border border-border bg-surface p-4 transition-colors hover:border-primary/40"
                >
                  <span className="text-2xl font-extrabold text-ink">{bCount}</span>
                  <span className="mt-1 block text-sm font-bold text-ink">
                    БЦ классов B и C с рейтингом от {RATING_THRESHOLD_LABEL}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">Рейтинг бизнес-центров классов B и C →</span>
                </Link>
              )}
            </div>
          </div>
        )}

        <FaqAccordion title="Частые вопросы" items={faqItems} id="faq" />

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Ещё по бизнес-центрам Минска</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/minsk/bcminsk" className="flex items-center gap-2 font-semibold text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Полный каталог бизнес-центров Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/class/a" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Все бизнес-центры класса A
              </Link>
            </li>
            <li>
              <Link to="/minsk/analytics/ofisy/arenda" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Аналитика: ставки аренды офисов в Минске
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/stroyashchiesya" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Строящиеся бизнес-центры Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/rating/samye-bolshie" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Самые большие бизнес-центры Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/rating/samye-dostupnye" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Самые доступные бизнес-центры Минска
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

        {/* Последний блок страницы — дисклеймер с источниками (правило
            владельца от 2026-09-17: предпоследний блок FAQ, последний —
            источники). На рейтинге его не было вовсе до 2026-09-22. Вид —
            ровно как на карточке БЦ и в каталоге (владелец, 2026-09-22:
            «дисклеймер ставь как на страницах БЦ»): один короткий текст без
            дат снимков и перечисления источников в теле страницы. */}
        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Источники</h2>
          <SourcesTrademarkNote />
        </div>

      </main>
    </div>
  );
}
