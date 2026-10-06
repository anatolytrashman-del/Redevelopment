// Близнец scripts/coworking-review-filter.mjs: три коворкинга без своей
// карточки на Яндексе — в выдачу только отзывы, где речь про коворкинг.

export const SHARED_COWORKING_ORG_SLUGS = new Set([
  'kino-moskva-coworking',
  'nbb-coworking',
  'sber-business-hub',
]);

const COWORKING_REVIEW_RE = /коворкинг|ко[\s-]*воркинг|coworking|бизнес[\s-]*хаб|business[\s-]*hub/iu;

export function needsCoworkingReviewFilter(slug: string | null | undefined): boolean {
  return SHARED_COWORKING_ORG_SLUGS.has(String(slug ?? ''));
}

export function isCoworkingReviewBody(body: string | null | undefined): boolean {
  return COWORKING_REVIEW_RE.test(String(body ?? ''));
}

export function filterCoworkingReviews<T extends { body?: string | null; source?: string | null }>(slug: string, reviews: T[]): T[] {
  if (!needsCoworkingReviewFilter(slug)) return reviews;
  return reviews.filter((review) =>
    (review.source != null && review.source !== 'yandex_maps') || isCoworkingReviewBody(review.body),
  );
}
