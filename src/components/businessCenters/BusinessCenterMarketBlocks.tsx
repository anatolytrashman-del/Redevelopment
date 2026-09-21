import { useMemo, useState } from 'react';
import { Gauge, History, MessageSquare, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import type { BusinessCenterReview } from '../../data/businessCenterReviews';
import { parseHighlightRatings, parseReviewQuote } from '../../lib/businessCenterDisplay';
import { AXIS_DOMAIN_PCT, type ComparisonBar, type MarketPosition } from '../../lib/businessCenterMarketPosition';
import type { PriceCard, PriceComparison } from '../../lib/businessCenterPriceCompare';

// Авторские блоки карточки БЦ (Б1, Б10, Б11 плана
// docs/bc-catalog-redesign-plan.md) — то, чего на странице не было вовсе:
// до 2026-09-16 карточка отвечала «какая тут площадь», но не «много это или
// мало». Общая идея взята у аналитики Минск Мира: каждое число стоит рядом
// с базой сравнения и выводом, а не само по себе.

// --- Б1. БЦ на фоне конкурентов ----------------------------------------

const TONE_TEXT_CLASS: Record<ComparisonBar['tone'], string> = {
  favorable: 'text-success',
  unfavorable: 'text-danger',
  neutral: 'text-ink-muted',
};
const TONE_BG_CLASS: Record<ComparisonBar['tone'], string> = {
  favorable: 'bg-success',
  unfavorable: 'bg-danger',
  neutral: 'bg-ink-muted',
};

function ComparisonRow({ bar }: { bar: ComparisonBar }) {
  const toneText = TONE_TEXT_CLASS[bar.tone];
  const toneBg = TONE_BG_CLASS[bar.tone];
  // Клип на ±50%: дальше бар упирается в край трека и получает шеврон,
  // точная величина остаётся текстом справа (deltaText её не обрезает).
  const clamped = Math.max(-AXIS_DOMAIN_PCT, Math.min(AXIS_DOMAIN_PCT, bar.deltaPct));
  const barWidth = Math.abs(clamped);
  const barLeft = clamped >= 0 ? 50 : 50 - barWidth;
  const clippedLeft = bar.deltaPct < -AXIS_DOMAIN_PCT;
  const clippedRight = bar.deltaPct > AXIS_DOMAIN_PCT;
  return (
    <div className="flex items-center gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0 sm:gap-4">
      <div className="w-24 shrink-0 sm:w-40">
        <div className="text-xs font-bold text-ink sm:text-sm">{bar.label}</div>
        {/* nowrap — значение короткое и должно остаться одной строкой; переносить
            можно только название метрики слева от него. */}
        <div className="mt-0.5 whitespace-nowrap text-[11px] text-ink-muted sm:text-xs">{bar.subjectDisplayValue}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-5">
          <span className="absolute inset-y-0 left-0 border-l border-border" />
          <span className="absolute inset-y-0 left-1/4 border-l border-dashed border-border" />
          <span className="absolute inset-y-0 left-1/2 w-0.5 -ml-px bg-ink-faint" />
          <span className="absolute inset-y-0 left-3/4 border-l border-dashed border-border" />
          <span className="absolute inset-y-0 right-0 border-r border-border" />
          {bar.ticks.map((t) => {
            const tickClamped = Math.max(-AXIS_DOMAIN_PCT, Math.min(AXIS_DOMAIN_PCT, t.deltaPct));
            return (
              <span
                key={t.label}
                className="absolute top-1 bottom-1 w-0.5 -ml-px rounded-full bg-ink-faint"
                style={{ left: `${50 + tickClamped}%` }}
                title={`${t.label} ${t.displayValue}`}
              />
            );
          })}
          {bar.nearTypical ? (
            <span className={cn('absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full', toneBg)} />
          ) : (
            <span
              className={cn('absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full', toneBg)}
              style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
            />
          )}
          {clippedLeft && <span className={cn('absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none', toneText)}>◀</span>}
          {clippedRight && <span className={cn('absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 text-[10px] leading-none', toneText)}>▶</span>}
        </div>
        <div className="mt-1 truncate text-center text-[10px] text-ink-faint sm:text-[11px]">{bar.captionText}</div>
      </div>
      <div className={cn('w-20 shrink-0 text-right text-xs font-bold sm:w-28 sm:text-sm', toneText)}>{bar.deltaText}</div>
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
    <div id="market" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Gauge className="h-5 w-5 shrink-0 text-ink-muted" />
          Место среди конкурентов
        </h2>
        <p className="ml-7 mt-1 text-xs text-ink-muted sm:text-sm">Сравнение с медианой БЦ того же класса</p>
      </div>

      {/* Шапка шкалы — те же колонки, что у строк ниже, поэтому подписи концов
          шкалы встают ровно над треками, не требуя лишней синхронизации ширин. */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="w-24 shrink-0 sm:w-40" />
        <div className="relative flex min-w-0 flex-1 items-center justify-center text-[10px] font-bold uppercase tracking-wide text-ink-faint">
          {/* На мобильном ширины не хватает на все пять подписей разом — они
              наезжали друг на друга; оставляем только «медиана» по центру,
              направление и так понятно по цвету и тексту дельты справа. */}
          <span className="hidden sm:absolute sm:left-0 sm:inline">◀ хуже · {AXIS_DOMAIN_PCT}%</span>
          <span className="hidden sm:absolute sm:left-1/4 sm:inline sm:-translate-x-1/2">25%</span>
          <span>медиана</span>
          <span className="hidden sm:absolute sm:left-3/4 sm:inline sm:-translate-x-1/2">25%</span>
          <span className="hidden sm:absolute sm:right-0 sm:inline">лучше ▶ · {AXIS_DOMAIN_PCT}%</span>
        </div>
        <div className="w-20 shrink-0 sm:w-28" />
      </div>

      {position.summary && <p className="text-sm font-semibold text-ink">{position.summary}</p>}

      <div className="flex flex-col gap-3">
        {position.bars.map((bar) => (
          <ComparisonRow key={bar.label} bar={bar} />
        ))}
      </div>
    </div>
  );
}

// --- Цены в здании и по рынку -------------------------------------------
//
// Вёрстка выбрана владельцем 2026-09-21 из нескольких макетов; отвергнутое
// по дороге стоит держать в голове, чтобы не вернуть: гребёнка с точкой
// «вы здесь» на шкале («надо быть прям аналитиком, чтобы разобраться»),
// шкала-термометр под плитками («непонятная»), тёмная плитка своего здания
// («слишком агрессивный») и красный акцент на цене («ещё хуже» — на
// странице, где мы это здание предлагаем, красный читается как авария).
// Осталось ровно три плитки на сделку: своё здание белым, базы сравнения
// блеклыми, и словесная оценка пилюлей под ценой.

function PriceTile({ card, self, verdict }: { card: PriceCard; self?: boolean; verdict?: string }) {
  return (
    <div className={cn('min-w-0 flex-1 basis-0 rounded-2xl px-5 py-4', self ? 'border border-border-strong bg-surface' : 'bg-surface-muted')}>
      <div className={cn('text-[11px] font-bold uppercase tracking-wider', self ? 'text-ink-muted' : 'text-ink-faint')}>{card.label}</div>
      {/* Длинные цены продажи («$1 430 – 2 050») в крупном кегле не влезают
          в треть ширины — им свой размер, а не перенос на вторую строку. */}
      <div
        className={cn(
          'mt-1.5 whitespace-nowrap font-black leading-none',
          card.value.length > 10 ? 'text-[24px]' : 'text-[30px]',
          self ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {card.value}
      </div>
      {verdict && (
        <div className="mt-2.5">
          <span className="inline-block rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-[11px] font-bold leading-none text-ink-muted">
            {verdict}
          </span>
        </div>
      )}
      <div className={cn('mt-2 text-[11px] leading-tight', self ? 'text-ink-muted' : 'text-ink-faint')}>{card.note}</div>
    </div>
  );
}

export function PriceComparisonBlock({ comparison }: { comparison: PriceComparison }) {
  if (comparison.blocks.length === 0) return null;
  return (
    <div id="rate-comparison" className={cn('mt-6 flex scroll-mt-32 flex-col gap-6 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="text-lg font-bold text-ink sm:text-xl">Цены в здании и по рынку</h2>
      {comparison.blocks.map((block) => (
        <div key={block.deal}>
          <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">{block.title}</div>
          <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
            <PriceTile card={block.self} self verdict={block.verdict} />
            {block.bases.map((b) => (
              <PriceTile key={b.label} card={b} />
            ))}
          </div>
        </div>
      ))}
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

// Родительный падеж числительного при "N корпусах/корпусам" — нужен только
// у «Порта» (3 отдельные карточки Яндекс.Карт на одно здание), но раз уж
// пишем склонение — по общему правилу, не захардкоженное на "3".
function pluralCorpus(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'корпусу';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'корпусам';
  return 'корпусам';
}

function ReviewStars({ stars }: { stars: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-label={`${stars} из 5 звёзд`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn('h-3 w-3', i < stars ? 'fill-primary text-primary' : 'text-border-strong')} />
      ))}
    </span>
  );
}

// Сколько реальных отзывов показывать — сетка 2 колонки, 3 ряда. Дальше
// уже не "самое главное, что говорят", а простыня — за полным списком
// пусть идут на сам Яндекс (это не архив отзывов, а витрина).
const MAX_REAL_REVIEWS = 6;

export function WhatTheySayBlock({
  center,
  reviewQuotes,
  reviews,
}: {
  center: BusinessCenter;
  reviewQuotes: string[];
  reviews: BusinessCenterReview[];
}) {
  const yandexRatings = useMemo(() => parseHighlightRatings(center.highlights), [center]);
  const hasGis = center.gisRating != null;
  // Порядок цитат — как в источнике (highlights), не пересортирован по
  // тональности: подборка не должна выглядеть отобранной в одну сторону —
  // владелец, 2026-09-19, обсуждая этот же блок: "если будут только
  // позитивные, это исказит картину".
  const quotes = useMemo(() => reviewQuotes.map(parseReviewQuote), [reviewQuotes]);
  // Реальные отзывы (fetchBusinessCenterReviews уже отдаёт их отсортированными
  // по нетто-голосам) вытесняют ручные цитаты, когда они собраны для этого
  // здания — тот же принцип "не мы выбираем, что показать", только годится
  // не для 5 кураторских цитат, а для сотни настоящих: владелец, 2026-09-19,
  // увидев, что счёт упоминаний темы без разбора тональности ничего не
  // говорит ("много парковки" и "нет парковки" — одна и та же тема): "давай
  // просто выводить самые залайканные комменты, неважно хорошие они или
  // плохие" — голосуют читатели Яндекса, не мы.
  // Постраничный вывод — тот же паттерн, что в каталоге арендаторов
  // (TenantDirectory) ниже на странице. Первая версия ("Показать все") по
  // клику разворачивала все 131 карточки в один подвал — владелец,
  // 2026-09-19: "не надо раскрывать все отзывы сразу, сделай постраничный
  // вывод, как на превью в каталоге арендаторов". Страница сбрасывается на 0,
  // если сменился сам список отзывов (переход на другой БЦ — см.
  // key={center.slug} у вызова этого блока), иначе при переходе со страницы N
  // одного здания на здание с меньшим числом отзывов страница могла бы
  // указывать за пределы списка.
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(reviews.length / MAX_REAL_REVIEWS));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageStart = clampedPage * MAX_REAL_REVIEWS;
  const visibleReviews = reviews.slice(pageStart, pageStart + MAX_REAL_REVIEWS);
  if (yandexRatings.length === 0 && !hasGis && quotes.length === 0 && visibleReviews.length === 0) return null;
  return (
    <div id="reviews" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <MessageSquare className="h-5 w-5 shrink-0 text-ink-muted" />
        Отзывы
      </h2>
      {/* Источники рядом, но НЕ усреднённые в одну цифру: сводить чужие
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
        {yandexRatings.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-2xl bg-surface-muted px-4 py-3">
            <Star className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="text-sm text-ink-muted">
              <span className="font-bold text-ink">{r.value}</span> на {r.source}
              {r.totalCount != null && ` · ${r.totalCount} оценок`}
              {r.corpusCount > 1 && ` (данные по ${r.corpusCount} ${pluralCorpus(r.corpusCount)})`}
            </span>
          </div>
        ))}
      </div>
      {visibleReviews.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleReviews.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-2xl bg-surface-muted px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-ink-muted">
                    {r.author ? r.author.charAt(0).toUpperCase() : '?'}
                  </span>
                  <span className="truncate text-sm font-semibold text-ink">{r.author ?? 'Отзыв'}</span>
                </div>
                {r.rating != null && <ReviewStars stars={Math.round(r.rating)} />}
              </div>
              <p className="line-clamp-4 text-sm leading-relaxed text-ink-muted">«{r.body}»</p>
              {/* Лайки/дизлайки — реальные голоса читателей Яндекса под этим
                  отзывом, не наша оценка; ровно то, по чему он попал в топ. */}
              <div className="flex items-center gap-3 text-xs text-ink-faint">
                <span className="flex items-center gap-1">
                  <ThumbsUp className="h-3.5 w-3.5" /> {r.likes}
                </span>
                {r.dislikes > 0 && (
                  <span className="flex items-center gap-1">
                    <ThumbsDown className="h-3.5 w-3.5" /> {r.dislikes}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {/* Те же классы кнопок, что у пагинации в TenantDirectory ниже на
          странице — владелец просил именно "как на превью в каталоге
          арендаторов", два разных пагинатора на одной странице разным
          стилем читались бы как две разные системы. */}
      {pageCount > 1 && (
        <div className="flex justify-end text-xs text-ink-muted">
          <div className="flex items-center gap-2">
            <span className="mr-1">
              {pageStart + 1}–{Math.min(pageStart + MAX_REAL_REVIEWS, reviews.length)} из {reviews.length}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="rounded-lg border border-border bg-white/70 px-3 py-1.5 font-semibold text-ink transition hover:border-primary/30 disabled:cursor-default disabled:opacity-35"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="rounded-lg border border-border bg-white/70 px-3 py-1.5 font-semibold text-ink transition hover:border-primary/30 disabled:cursor-default disabled:opacity-35"
            >
              Дальше
            </button>
          </div>
        </div>
      )}
      {visibleReviews.length === 0 && (
        quotes.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {quotes.map((q, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-2xl bg-surface-muted px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-ink-muted">
                      {q.author ? q.author.charAt(0).toUpperCase() : '?'}
                    </span>
                    <span className="truncate text-sm font-semibold text-ink">{q.author ?? 'Отзыв'}</span>
                  </div>
                  {q.stars != null && <ReviewStars stars={q.stars} />}
                </div>
                <p className="text-sm leading-relaxed text-ink-muted">{q.isQuote ? `«${q.text}»` : q.text}</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
