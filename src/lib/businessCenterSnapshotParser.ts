import { parseBplist } from './bplist';
import { looksLikeBplist, parseHtmlSnapshotOrgList } from './webarchiveOrgParser';
import type { TenantOrganization } from '../data/businessCenters';
import { pluralRu } from './pluralRu';

// Владелец, 2026-09-06: "если в карточку БЦ загружается новый веб-архив,
// система будет автоматически запускать обновление... и менять контент на
// странице карточки БЦ". Согласовано в этой же сессии (AskUserQuestion) —
// автоматически обновляем ТОЛЬКО структурные данные (список организаций в
// здании + рейтинг), НЕ текстовые "Интересные факты" (история/награды/СМИ/
// отзывы) — те требуют ресерча и независимой проверки, автоматически их
// генерировать/перезаписывать рискованно (см. многочисленные записи журнала
// docs/session-journal.md про выдуманные факты и цитаты у grounded-моделей). Разбор — по
// принципу "лучшее усилие": не смогли распознать файл или ничего не нашли —
// молча ничего не меняем, не показываем ошибку (это бонус поверх основного
// сохранения формы, не обязательный шаг — см. вызывающий код в
// BusinessCentersAdminTab.tsx).
//
// Организации — переиспользован ТОТ ЖЕ парсер, что и для house-upload
// (webarchiveOrgParser.ts, карточки `.search-business-snippet-view`) —
// проверено на 3 реальных .webarchive владельца для БЦ "Проспект"
// (2026-09-06, файлы "Проспект Независимости, 32Ас2/3/4 — Яндекс Карты"):
// список "Организации в здании" на toponym-странице адреса собран ровно
// тем же компонентом Яндекс.Карт, что и на house-странице, разбирается без
// изменений в самом парсере.
//
// Рейтинг — schema.org микроразметка (ratingValue/ratingCount/reviewCount)
// либо JSON-LD aggregateRating — тот же формат, что был на реальном файле
// рейтинга/отзывов "Проспекта" при самом первом ручном разборе (см. запись
// журнала "Новая карточка «Интересные факты»...", 2026-09-06: "реальный
// ratingValue=5.0/ratingCount=204/reviewCount=27 из микроразметки
// schema.org на странице"). В трёх свежих файлах-примерах её не было — это
// оказались страницы конкретных подъездов/секций здания, а не страница
// рейтинга/отзывов — код рассчитан на файл, где она есть, и просто ничего
// не находит там, где её нет.

const EXCLUDE_TENANT_CATEGORIES = new Set(['Автомобильная парковка', 'Велопарковка', 'Инженерная инфраструктура']);

export interface ParsedSnapshotRating {
  value: string; // "4,8" — уже с русской запятой, готово для формата extractMapRating
  count: number | null;
  reviewCount: number | null;
}

// Отзывы — ИСКЛЮЧЕНИЕ из правила выше ("текстовые факты вручную, не
// автоматически"): это не сгенерированный текст и не наш пересказ, а
// verbatim-текст реальных людей с самого Яндекса, извлечённый структурным
// разбором разметки (author/rating/likes — из itemprop/aria-label, не
// придумано). Тот же класс риска, что у списка организаций и рейтинга, не
// у "Интересных фактов". См. docs/session-journal.md, 2026-09-19/20 — блок
// «Что говорят» на публичной карточке БЦ.
export interface ParsedSnapshotReview {
  author: string | null;
  rating: number | null;
  body: string;
  likes: number;
  dislikes: number;
  publishedAt: string | null;
}

export interface ParsedBusinessCenterSnapshot {
  tenantOrganizations: TenantOrganization[];
  rating: ParsedSnapshotRating | null;
  reviews: ParsedSnapshotReview[];
}

function decodeSnapshotHtml(buffer: ArrayBuffer): string {
  if (looksLikeBplist(buffer)) {
    const root = parseBplist(buffer) as { WebMainResource?: { WebResourceData?: Uint8Array } };
    const htmlBytes = root?.WebMainResource?.WebResourceData;
    if (!htmlBytes) throw new Error('В .webarchive не нашлось WebMainResource');
    return new TextDecoder('utf-8').decode(htmlBytes);
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function numberFromElement(el: Element | null): number | null {
  if (!el) return null;
  const raw = (el.getAttribute('content') ?? el.textContent ?? '').trim().replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function extractRatingFromHtml(html: string): ParsedSnapshotRating | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  let value = numberFromElement(doc.querySelector('[itemprop="ratingValue"]'));
  let count = numberFromElement(doc.querySelector('[itemprop="ratingCount"]'));
  let reviewCount = numberFromElement(doc.querySelector('[itemprop="reviewCount"]'));

  if (value == null) {
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data: unknown;
      try {
        data = JSON.parse(script.textContent ?? 'null');
      } catch {
        continue; // не наш JSON-LD блок, пропускаем
      }
      for (const item of Array.isArray(data) ? data : [data]) {
        const agg = (item as { aggregateRating?: Record<string, unknown> } | null)?.aggregateRating;
        if (agg?.ratingValue == null) continue;
        const v = Number(String(agg.ratingValue).replace(',', '.'));
        if (!Number.isFinite(v)) continue;
        value = v;
        count = agg.ratingCount != null ? Number(agg.ratingCount) : count;
        reviewCount = agg.reviewCount != null ? Number(agg.reviewCount) : reviewCount;
        break;
      }
      if (value != null) break;
    }
  }

  if (value == null) return null;
  return {
    value: value.toFixed(1).replace('.', ','),
    count: count != null ? Math.round(count) : null,
    reviewCount: reviewCount != null ? Math.round(reviewCount) : null,
  };
}

// Карточки .business-review-view — только на вкладке «Отзывы» конкретной
// организации (не на toponym-странице адреса, где живёт список organizаций).
// Владелец, 2026-09-19 (владелец сохранил вкладку «Отзывы» «Порта» через
// Cmd+S и прислал файл): 134 карточки на странице, 3 — дубликат виджета
// «похожих» вверху (тот же автор+дата), дедуп по этой паре.
//
// СЕЛЕКТОРЫ-БЛИЗНЕЦЫ (2026-09-22): та же разметка разбирается ещё раз —
// внутри page.evaluate() в scripts/capture-yandex-reviews.mjs (полуавтомат
// прямо с открытой вкладки Яндекс.Карт, без ручного сохранения .webarchive).
// TS-модуль в браузерный контекст Playwright не импортировать, поэтому
// список полей продублирован построчно — Яндекс поменял вёрстку, чинить
// сразу в обоих местах.
function extractReviewsFromHtml(html: string): ParsedSnapshotReview[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = doc.querySelectorAll('.business-review-view');

  const seen = new Set<string>();
  const reviews: ParsedSnapshotReview[] = [];
  for (const card of cards) {
    const author = card.querySelector('[itemprop="author"] [itemprop="name"]')?.textContent?.trim() || null;
    const publishedAt = card.querySelector('[itemprop="datePublished"]')?.getAttribute('content') ?? null;
    const body = card.querySelector('.spoiler-view__text-container')?.textContent?.trim() ?? '';
    if (!author || !publishedAt || !body) continue;

    const key = `${author}__${publishedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rating = numberFromElement(card.querySelector('[itemprop="ratingValue"]'));
    const likeButton = card.querySelector('[aria-label="Лайк"]');
    const dislikeButton = card.querySelector('[aria-label="Дизлайк"]');
    const likes = likeButton ? Number(likeButton.querySelector('.business-reactions-view__counter')?.textContent ?? '0') : 0;
    const dislikes = dislikeButton ? Number(dislikeButton.querySelector('.business-reactions-view__counter')?.textContent ?? '0') : 0;

    reviews.push({ author, rating, body, likes, dislikes, publishedAt });
  }
  return reviews;
}

export async function parseBusinessCenterSnapshot(file: File): Promise<ParsedBusinessCenterSnapshot> {
  const empty: ParsedBusinessCenterSnapshot = { tenantOrganizations: [], rating: null, reviews: [] };
  let html: string;
  try {
    html = decodeSnapshotHtml(await file.arrayBuffer());
  } catch {
    return empty; // не .webarchive/.html — например PDF, ничего не парсим
  }

  let tenantOrganizations: TenantOrganization[] = [];
  try {
    tenantOrganizations = parseHtmlSnapshotOrgList(html)
      .filter((o) => !EXCLUDE_TENANT_CATEGORIES.has(o.rawCategory ?? ''))
      .map((o) => ({ name: o.title, category: o.rawCategory ?? '' }));
  } catch {
    tenantOrganizations = [];
  }

  let rating: ParsedSnapshotRating | null = null;
  try {
    rating = extractRatingFromHtml(html);
  } catch {
    rating = null;
  }

  let reviews: ParsedSnapshotReview[] = [];
  try {
    reviews = extractReviewsFromHtml(html);
  } catch {
    reviews = [];
  }

  return { tenantOrganizations, rating, reviews };
}

// Формат строки, который уже понимает extractMapRating в
// BusinessCenterDetailPage.tsx (см. комментарий там же) — "- Яндекс.Карты:
// **4,8** из 5 (204 оценки, 27 отзывов)". Держать в синхроне с той функцией,
// если формат когда-то поменяется.
export function formatRatingHighlightText(rating: ParsedSnapshotRating): string {
  const parts: string[] = [];
  if (rating.count != null) parts.push(`${rating.count} ${pluralRu(rating.count, 'оценка', 'оценки', 'оценок')}`);
  if (rating.reviewCount != null) parts.push(`${rating.reviewCount} ${pluralRu(rating.reviewCount, 'отзыв', 'отзыва', 'отзывов')}`);
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `- Яндекс.Карты: **${rating.value}** из 5${suffix}`;
}

// Объединяет уже сохранённые организации с найденными автоматически —
// дедуп по названию без учёта регистра, ручные/уже сохранённые записи не
// трогаем и не дублируем, новые из файла просто дописываются.
export function mergeTenantOrganizations(existing: TenantOrganization[], found: TenantOrganization[]): TenantOrganization[] {
  const merged = [...existing];
  const seen = new Set(existing.map((o) => o.name.trim().toLowerCase()));
  for (const org of found) {
    const key = org.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(org);
  }
  return merged;
}
