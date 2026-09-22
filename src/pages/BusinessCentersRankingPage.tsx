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
import { shortName, shortAddress, mapRatingFromHighlights } from '../lib/businessCenterDisplay';
import { classHubUrl } from '../lib/businessCenterHubs';
import { PhotoBlock } from '../components/businessCenters/BusinessCenterVisuals';
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
const RATING_THRESHOLD = 4.5;
// Отдельная подпись с запятой — `${RATING_THRESHOLD}` подставляет JS-число и
// даёт «4.5» с точкой в title, description и на самой странице, рядом с
// «5,0» в строках рейтинга (находка разбора 2026-09-22).
const RATING_THRESHOLD_LABEL = '4,5';
const MIN_RATING_COUNT = 50;
const DATE_PUBLISHED = '2026-09-07';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/rating';
const TITLE = `Лучшие бизнес-центры Минска: рейтинг класса A с оценкой от ${RATING_THRESHOLD_LABEL}`;
const DESCRIPTION =
  `Рейтинг бизнес-центров Минска: класс A, рейтинг на Яндекс.Картах от ${RATING_THRESHOLD_LABEL} из 5 и не менее ` +
  `${MIN_RATING_COUNT} оценок здания. Открытая методика, число оценок и медианная ставка аренды по каждому БЦ.`;
const PAGE_H1 = 'Лучшие бизнес-центры Минска';
// Раздел «Классы A, B+, B и C» в гиде по бизнес-центрам — туда ведёт
// «как определяется класс» из методики (владелец, 2026-09-22).
const CLASS_EXPLAINER_URL = '/minsk/bcminsk/gid#klassy';

export interface RankedCenter {
  center: BusinessCenter;
  rating: number;
  ratingLabel: string;
  ratingCount: number;
}

// Здания вне городской черты. Проверяется по адресу и району, а не по
// координатам: границы города в базе не лежат, а адрес у всех 141 карточки
// заполнен и у минских начинается с «г. Минск». На 2026-09-22 под правило
// попадают три карточки каталога — «Аден» (индустриальный парк «Великий
// камень», Смолевичский район), плюс два объекта с адресом в Минской
// области и Минском районе.
function isOutsideMinsk(center: BusinessCenter): boolean {
  const haystack = `${center.address} ${center.district ?? ''}`;
  return /Минская область|Минский район|Смолевичск|Великий камень/i.test(haystack);
}

export interface ExcludedCenter {
  center: BusinessCenter;
  reason: string;
}

// Класс A, сдан, но в рейтинг не попал — с проверяемой причиной. Нужен для
// FAQ: блок «кто не попал» владелец со страницы убрал (2026-09-22), но сам
// вопрос остался, и отвечать на него надо фактами из базы, а не текстом,
// который разъедется с данными.
export function buildExcluded(centers: BusinessCenter[]): ExcludedCenter[] {
  return centers
    .filter((c) => c.businessClass === 'A' && c.status !== 'under_construction')
    .map((center) => {
      if (isOutsideMinsk(center)) return { center, reason: 'не в черте Минска' };
      const rating = mapRatingFromHighlights(center.highlights);
      if (!rating) return { center, reason: 'рейтинг на Яндекс.Картах не распознан' };
      if (rating.value < RATING_THRESHOLD)
        return { center, reason: `рейтинг ${rating.label} из 5, ниже порога ${RATING_THRESHOLD_LABEL}` };
      if (rating.count == null) return { center, reason: 'в карточке карт не указано число оценок' };
      if (rating.count < MIN_RATING_COUNT)
        return { center, reason: `${rating.count} ${ratingsWord(rating.count)}, меньше порога ${MIN_RATING_COUNT}` };
      return null;
    })
    .filter((e): e is ExcludedCenter => e !== null);
}

// Экспортирована для блока "Рейтинг БЦ Минска" на странице объекта
// (BusinessCenterDetailPage.tsx) — тот блок обязан показывать РОВНО тех
// же лидеров, что и эта страница, а не собственный подсчёт по другому
// полю: BusinessCenter.gisRating (снимок 2ГИС) и рейтинг с Яндекс.Карт
// (mapRatingFromHighlights, источник методики здесь) — разные числа для
// одного и того же здания, и здание с высоким gisRating может не попасть
// в этот рейтинг вовсе (не тот класс, ниже порога, мало оценок или вообще
// нет распознанного рейтинга с карт). Показать его в блоке-тизере как часть
// "рейтинга" было бы неправдой (владелец, 2026-09-20: "в рейтинге нет БЦ
// Капитал Палас").
export function buildRanking(centers: BusinessCenter[]): RankedCenter[] {
  return centers
    .filter((c) => c.businessClass === 'A' && c.status !== 'under_construction' && !isOutsideMinsk(c))
    .map((c) => {
      const rating = mapRatingFromHighlights(c.highlights);
      if (!rating || rating.count == null) return null;
      return { center: c, rating: rating.value, ratingLabel: rating.label, ratingCount: rating.count };
    })
    .filter((r): r is RankedCenter => r !== null && r.rating >= RATING_THRESHOLD && r.ratingCount >= MIN_RATING_COUNT)
    .sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
}

const nf = new Intl.NumberFormat('ru-RU');

// «161 оценка», «17 493 оценки», «445 оценок» — число оценок стоит в каждой
// строке рейтинга и в FAQ, и «17 493 оценок» бросается в глаза сразу.
function ratingsWord(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'оценок';
  if (mod10 === 1) return 'оценка';
  if (mod10 >= 2 && mod10 <= 4) return 'оценки';
  return 'оценок';
}

function ratingsCount(n: number): string {
  return `${nf.format(n)} ${ratingsWord(n)}`;
}

// Медиана приходит из базы как есть (21.14) — без форматирования в тексте
// FAQ получалось «$21.14/м²» с точкой рядом с «$13/м²» в строках.
function money(value: number): string {
  return `$${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}/м²`;
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-faint">{label}</span>
      <span className="text-[13.5px] font-bold leading-snug text-ink">{children}</span>
    </div>
  );
}

// Медиана ставки по зданию — из тех же месячных снимков рынка
// (market_snapshots, slice_type='building'), что показывает каталог: считать
// её здесь заново по business_center_offers значило бы показать на двух
// страницах два разных числа по одному зданию. Выборка по одному зданию
// почти всегда мала, поэтому рядом всегда стоит, по скольким объявлениям
// посчитано, а ниже порога надёжности (MIN_RELIABLE_N) число помечается как
// ориентировочное — тот же приём, что на страницах аналитики.
function rentLabel(snapshot: MarketSnapshot | undefined): { label: string; value: string } | null {
  if (!snapshot || snapshot.median == null) return null;
  const reliable = snapshot.n >= MIN_RELIABLE_N;
  return {
    label: reliable ? `Аренда · ${snapshot.n} объявл.` : `Аренда · ориент., ${snapshot.n} объявл.`,
    value: money(snapshot.median),
  };
}

function RankingRow({
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
    <Link
      to={`/minsk/bcminsk/${center.slug}`}
      className={cn('group flex items-start gap-4 p-4 transition-colors hover:border-primary/40', glassCardClass)}
      style={glassCardShadow}
    >
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold',
          place <= 3 ? 'bg-primary text-white' : 'bg-surface-muted text-ink',
        )}
      >
        {place}
      </span>
      <div className="relative h-[88px] w-[118px] shrink-0 overflow-hidden rounded-control">
        <PhotoBlock center={center} variant="card" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-base font-bold leading-snug text-ink">{shortName(center)}</h2>
        <p className="text-xs text-ink-faint">
          {[center.yearBuilt, shortAddress(center.address)].filter(Boolean).join(', ')}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
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
        </div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-primary" />
    </Link>
  );
}

// Сколько зданий класса ниже A прошло бы тот же порог — для блока
// «Рейтинги по остальным классам». Считается той же функцией условий, что и
// основной список, только с другим классом: иначе цифра в тизере разъедется
// с тем, что человек увидит, когда такие страницы появятся.
function countQualifying(centers: BusinessCenter[], businessClass: 'B+' | 'B'): number {
  return buildRanking(
    centers.filter((c) => c.businessClass === businessClass).map((c) => ({ ...c, businessClass: 'A' as const })),
  ).length;
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
  const bPlusCount = useMemo(() => (centers ? countQualifying(centers, 'B+') : 0), [centers]);
  const bCount = useMemo(() => (centers ? countQualifying(centers, 'B') : 0), [centers]);

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
          ? `Тем же трём условиям в других классах отвечают ${bPlusCount} бизнес-центров класса B+ и ${bCount} класса B — ` +
            'их списки соберём отдельными страницами. '
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
              <RankingRow key={r.center.slug} ranked={r} place={i + 1} rent={offerIndex.rentBySlug.get(r.center.slug)} />
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
              ниже: их списки соберём отдельными страницами, а пока смотреть их можно в каталоге.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {bPlusCount > 0 && (
                <Link
                  to={classHubUrl('B+')}
                  className="rounded-control border border-border bg-surface p-4 transition-colors hover:border-primary/40"
                >
                  <span className="text-2xl font-extrabold text-ink">{bPlusCount}</span>
                  <span className="mt-1 block text-sm font-bold text-ink">
                    БЦ класса B+ с рейтингом от {RATING_THRESHOLD_LABEL}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">Все бизнес-центры класса B+ в каталоге →</span>
                </Link>
              )}
              {bCount > 0 && (
                <Link
                  to={classHubUrl('B')}
                  className="rounded-control border border-border bg-surface p-4 transition-colors hover:border-primary/40"
                >
                  <span className="text-2xl font-extrabold text-ink">{bCount}</span>
                  <span className="mt-1 block text-sm font-bold text-ink">
                    БЦ класса B с рейтингом от {RATING_THRESHOLD_LABEL}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">Все бизнес-центры класса B в каталоге →</span>
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
