import type { RetailInfo } from '../data/businessCenters';
import { pluralRu } from './pluralRu';

export type ReviewThemes = NonNullable<RetailInfo['reviewThemes']>;

export function moreFactsLabel(count: number): string {
  return `Ещё ${count} ${pluralRu(count, 'факт', 'факта', 'фактов')}`;
}

// Сводка отзывов ТЦ (владелец, 2026-09-30: «не список всех отзывов, а
// сводка»). От REVIEW_THEMES_MIN_REVIEWS разобранных отзывов показываем темы;
// доли в процентах — только от REVIEW_THEMES_SHARE_MIN_REVIEWS: на 30
// отзывах «7%» — это два человека, и цифра выглядит точнее, чем она есть.
// Меньше порога — блока нет вовсе: дословный список отзывов у ТЦ не выводим.
export const REVIEW_THEMES_MIN_REVIEWS = 20;
export const REVIEW_THEMES_SHARE_MIN_REVIEWS = 100;

export function reviewThemesVisible(themes: ReviewThemes | null | undefined): boolean {
  return Boolean(themes && themes.reviews >= REVIEW_THEMES_MIN_REVIEWS && reviewThemeColumns(themes).length);
}

export function reviewThemesShowShares(themes: ReviewThemes): boolean {
  return themes.reviews >= REVIEW_THEMES_SHARE_MIN_REVIEWS;
}

export function reviewThemeColumns(themes: ReviewThemes) {
  return [
    { key: 'praise', title: 'Хвалят', color: '#2f8f4e', items: themes.praise },
    { key: 'complaints', title: 'Жалуются', color: '#b4533a', items: themes.complaints },
  ].filter((column) => column.items.length > 0);
}

export function reviewThemeWidth(share: number, themes: ReviewThemes): number {
  const max = Math.max(0, ...themes.praise.map((t) => t.share), ...themes.complaints.map((t) => t.share));
  return max > 0 ? Math.min(100, Math.max(0, share / max * 100)) : 0;
}

export function reviewThemesFaq(themes: ReviewThemes): string | null {
  const top = (items: ReviewThemes['praise'], count: number) => [...items]
    .sort((a, b) => b.share - a.share).slice(0, count)
    .map((t) => (reviewThemesShowShares(themes) ? `${t.theme} (${t.share}%)` : t.theme)).join('; ');
  const praise = top(themes.praise, 3);
  const complaints = top(themes.complaints, 2);
  return [praise && `Хвалят: ${praise}.`, complaints && `Жалуются: ${complaints}.`].filter(Boolean).join(' ') || null;
}

export function yandexReviewsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && /^(?:www\.)?yandex\.(?:ru|by|com)$/.test(url.hostname) && url.pathname.includes('/maps/org/') ? url.href : undefined;
  } catch {
    return undefined;
  }
}
