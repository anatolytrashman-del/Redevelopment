import { useMemo, useState } from 'react';
import { Gauge, History, MessageSquare, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import type { BusinessCenterReview } from '../../data/businessCenterReviews';
import { parseHighlightRatings, parseReviewQuote } from '../../lib/businessCenterDisplay';
import type { MarketPosition } from '../../lib/businessCenterMarketPosition';

// Авторские блоки карточки БЦ (Б1, Б10, Б11 плана
// docs/bc-catalog-redesign-plan.md) — то, чего на странице не было вовсе:
// до 2026-09-16 карточка отвечала «какая тут площадь», но не «много это или
// мало». Общая идея взята у аналитики Минск Мира: каждое число стоит рядом
// с базой сравнения и выводом, а не само по себе.

// --- Б1. БЦ на фоне конкурентов ----------------------------------------

function Bar({
  label,
  value,
  max,
  tone,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'subject' | 'baseline';
  unit: string;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={cn('w-28 shrink-0 text-xs sm:w-36', tone === 'subject' ? 'font-bold text-ink' : 'text-ink-muted')}>
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={cn('block h-full rounded-full', tone === 'subject' ? 'bg-primary' : 'bg-border-strong')}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className={cn('w-24 shrink-0 text-right text-xs tabular-nums', tone === 'subject' ? 'font-bold text-ink' : 'text-ink-muted')}>
        {/* Деньги пишем как «$18/м²», а не «18 $/м²» — так же, как везде
            на сайте; остальные единицы идут после числа. */}
        {unit.startsWith('$') ? `$${value.toLocaleString('ru-RU')}${unit.slice(1)}` : `${value.toLocaleString('ru-RU')} ${unit}`}
      </span>
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
    <div id="market" className={cn('mt-6 flex scroll-mt-32 flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Gauge className="h-5 w-5 shrink-0 text-ink-muted" />
        БЦ на фоне конкурентов
      </h2>

      <div className="flex flex-col gap-5">
        {position.bars.map((bar) => {
          const max = Math.max(bar.value, ...bar.baselines.map((b) => b.value));
          return (
            <div key={bar.label} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-bold text-ink">{bar.label}</span>
                {bar.note && <span className="text-xs text-ink-muted">{bar.note}</span>}
              </div>
              <Bar label="это здание" value={bar.value} max={max} tone="subject" unit={bar.unit} />
              {bar.baselines.map((b) => (
                <Bar key={b.label} label={b.label} value={b.value} max={max} tone="baseline" unit={bar.unit} />
              ))}
            </div>
          );
        })}
      </div>
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
        Что говорят
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
