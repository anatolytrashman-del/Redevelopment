import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd, setItemListJsonLd } from '../lib/pageMeta';
import { fetchBusinessCenters, snapshotBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import type { BusinessCenter } from '../data/businessCenters';
import { shortName } from '../lib/businessCenterDisplay';
import { Cell, RankingRow } from '../components/businessCenters/RankingRow';
import {
  isOutsideMinsk,
  MIN_RATING_COUNT,
  RATING_THRESHOLD_LABEL,
  ratingsCount,
} from '../lib/businessCenterRanking';
import { buildTcExcluded, buildTcRanking, type RankedCenter } from '../lib/tradeCenterRanking';
import { CatalogMap } from '../components/businessCenters/CatalogMap';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { nearestMetroStation } from '../lib/metroStations';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { EMPTY_OFFER_INDEX } from '../lib/businessCenterCatalogFilter';
import { tcTopicHubUrl, TC_TOPIC_HUBS } from '../lib/tradeCenterHubs';

const DATE_PUBLISHED = '2026-10-04';
const PAGE_URL = 'https://redevelopment.pro/minsk/tc/rating';
const PAGE_H1 = 'Лучшие торговые центры Минска';
const TITLE = `Лучшие торговые центры Минска: рейтинг с оценкой от ${RATING_THRESHOLD_LABEL}`;
const DESCRIPTION =
  `Рейтинг торговых центров Минска: оценка на Яндекс.Картах от ${RATING_THRESHOLD_LABEL} из 5 ` +
  `при ${MIN_RATING_COUNT}+ отзывах. Открытая методика, площадь и метро по каждому ТЦ.`;

function RatedRankingRow({ ranked, place }: { ranked: RankedCenter; place: number }) {
  const { center, ratingLabel, ratingCount } = ranked;
  const nearestMetro = nearestMetroStation(center.nearestMetroStations ?? []);
  return (
    <RankingRow
      center={center}
      place={place}
      basePath="/minsk/tc"
      cells={
        <>
          <Cell label="Рейтинг">
            ★ {ratingLabel}
            <span className="font-medium text-ink-muted"> · {ratingsCount(ratingCount)}</span>
          </Cell>
          {center.totalArea != null && (
            <Cell label="Площадь">
              {center.totalArea.toLocaleString('ru-RU')}
              <span className="font-medium text-ink-muted"> м²</span>
            </Cell>
          )}
          {center.retailFormat && <Cell label="Формат">{center.retailFormat}</Cell>}
          {nearestMetro && <Cell label="Метро">{nearestMetro.name}</Cell>}
        </>
      }
    />
  );
}

export function TradeCentersRankingPage() {
  const [centers, setCenters] = useState<BusinessCenter[] | null>(() => snapshotBusinessCenters('tc'));
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    fetchBusinessCenters('tc')
      .then(setCenters)
      .catch(() => setCenters((prev) => prev ?? []));
  }, []);

  const ranking = useMemo(() => (centers ? buildTcRanking(centers) : []), [centers]);
  const excluded = useMemo(() => (centers ? buildTcExcluded(centers) : []), [centers]);
  const eligibleTotal = useMemo(
    () => (centers ?? []).filter((c) => c.status !== 'under_construction' && !isOutsideMinsk(c)).length,
    [centers],
  );

  const faqItems = useMemo(() => {
    if (ranking.length === 0) return [];
    const leader = ranking[0];
    const byCount = [...ranking].sort((a, b) => b.ratingCount - a.ratingCount);
    const mostRated = byCount[0];
    const leastRated = byCount[byCount.length - 1];
    const withYear = ranking.filter((r) => r.center.yearBuilt != null).sort((a, b) => (b.center.yearBuilt ?? 0) - (a.center.yearBuilt ?? 0));
    const withArea = ranking.filter((r) => r.center.totalArea != null).sort((a, b) => (b.center.totalArea ?? 0) - (a.center.totalArea ?? 0));

    const items: { question: string; answer: string }[] = [
      {
        question: 'По какой методике составлен рейтинг торговых центров Минска?',
        answer:
          `Два проверяемых условия: рейтинг на Яндекс.Картах не ниже ${RATING_THRESHOLD_LABEL} из 5 и не менее ` +
          `${MIN_RATING_COUNT} оценок здания. Внутри списка — по рейтингу, при равном рейтинге выше тот, у кого больше оценок. ` +
          'Строящиеся объекты и здания вне черты Минска не участвуют. Субъективных оценок и скрытых весов нет.',
      },
      {
        question: 'Какой торговый центр Минска с самым высоким рейтингом в этом списке?',
        answer: `«${shortName(leader.center)}» — ${leader.ratingLabel} из 5 на Яндекс.Картах, и это ${ratingsCount(leader.ratingCount)}.`,
      },
      {
        question: 'Сколько торговых центров попало в рейтинг?',
        answer:
          `${ranking.length} из ${eligibleTotal} сданных торговых центров в черте Минска. ` +
          (excluded.length > 0 && excluded.length <= 8
            ? `Не попали: ${excluded.map((e) => `«${shortName(e.center)}» — ${e.reason}`).join('; ')}.`
            : excluded.length > 8
              ? `Не попали ${excluded.length} объектов: нет распознанного рейтинга, рейтинг ниже порога или мало оценок.`
              : ''),
      },
    ];

    if (mostRated && leastRated && mostRated.ratingCount > leastRated.ratingCount * 3) {
      items.push({
        question: 'Почему у одних ТЦ тысячи оценок, а у других — меньше сотни?',
        answer:
          `У «${shortName(mostRated.center)}» — ${ratingsCount(mostRated.ratingCount)}, у «${shortName(leastRated.center)}» — ` +
          `${ratingsCount(leastRated.ratingCount)}. Оценку ставят посетители здания: чем больше магазинов, кафе и развлечений, ` +
          `тем больше отзывов. Порог в ${MIN_RATING_COUNT} оценок нужен, чтобы не сравнивать высокий балл по десяткам отзывов с таким же по тысячам.`,
      });
    }

    if (withArea.length >= 2) {
      items.push({
        question: 'Какой торговый центр из рейтинга самый большой по площади?',
        answer: `Из попавших в рейтинг с известной площадью больше всего у «${shortName(withArea[0].center)}» — ${withArea[0].center.totalArea?.toLocaleString('ru-RU')} м². Площадь на место в рейтинге не влияет.`,
      });
    }

    if (withYear.length >= 2) {
      items.push({
        question: 'Какой торговый центр из рейтинга самый новый?',
        answer: `«${shortName(withYear[0].center)}» — ${withYear[0].center.yearBuilt} год. Самый старый в списке — «${shortName(withYear[withYear.length - 1].center)}», ${withYear[withYear.length - 1].center.yearBuilt} год.`,
      });
    }

    items.push({
      question: 'Где посмотреть все торговые центры, а не только рейтинг?',
      answer:
        'Полный каталог — на странице «Торговые центры Минска». Отдельно есть подборка для шопинга и список самых больших ТЦ по площади.',
    });

    items.push({
      question: 'Как часто обновляется рейтинг?',
      answer:
        'Список пересчитывается из каталога при каждом открытии страницы: изменился рейтинг здания на картах — изменится и страница.',
    });

    return items;
  }, [ranking, excluded, eligibleTotal]);

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
      { name: 'Торговые центры Минска', url: 'https://redevelopment.pro/minsk/tc' },
      { name: 'Рейтинг' },
    ]);
  }, []);

  useEffect(() => {
    if (ranking.length === 0) return;
    setItemListJsonLd(ranking.map((r) => ({ name: shortName(r.center), url: `https://redevelopment.pro/minsk/tc/${r.center.slug}` })));
    setFaqJsonLd(faqItems);
  }, [ranking, faqItems]);

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
          <span className="text-ink">Рейтинг</span>
        </nav>

        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 shrink-0 text-icon" />
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
          </div>
          <div className="text-xs text-ink-muted">
            <strong className="text-ink">Методика оценки:</strong>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-ink">
              <li>Сданные торговые центры в черте Минска</li>
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
                Пока ни один торговый центр не набрал рейтинг {RATING_THRESHOLD_LABEL} и выше при {MIN_RATING_COUNT} и более оценках.
              </p>
            )}
            {ranking.map((r, i) => (
              <RatedRankingRow key={r.center.slug} ranked={r} place={i + 1} />
            ))}
          </div>
        )}

        {ranking.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-ink">Где они находятся</h2>
            {showMap ? (
              <CatalogMap centers={ranking.map((r) => r.center)} offers={EMPTY_OFFER_INDEX} heightClass="h-[30vh] min-h-[220px]" />
            ) : (
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className={cn('flex flex-col items-center gap-1 p-8 text-center transition-colors hover:border-primary/40', glassCardClass)}
                style={glassCardShadow}
              >
                <span className="text-sm font-bold text-ink">Показать {ranking.length} ТЦ рейтинга на карте</span>
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
              <Link to="/minsk/tc/rating/largest" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Самые большие торговые центры Минска
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
