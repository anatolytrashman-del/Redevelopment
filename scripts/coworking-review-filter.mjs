// Три коворкинга без своей карточки на Яндексе: отзывы лежат на карточке
// кинотеатра / библиотеки / банка. В каталог идут только те, где речь про
// коворкинг (владелец, 2026-10-06). Остальные восемь объектов фильтр не
// трогает: у них карточка своя, любой отзыв — про коворкинг.

export const SHARED_COWORKING_ORG_SLUGS = new Set([
  'kino-moskva-coworking',
  'nbb-coworking',
  'sber-business-hub',
]);

// Postgres ~* (без \b: граница слова по ASCII, кириллицу не режет).
export const COWORKING_REVIEW_SQL = String.raw`коворкинг|ко[[:space:]-]*воркинг|coworking|бизнес[[:space:]-]*хаб|business[[:space:]-]*hub`;

const COWORKING_REVIEW_RE = /коворкинг|ко[\s-]*воркинг|coworking|бизнес[\s-]*хаб|business[\s-]*hub/iu;

export function needsCoworkingReviewFilter(slug) {
  return SHARED_COWORKING_ORG_SLUGS.has(String(slug ?? ''));
}

export function isCoworkingReviewBody(body) {
  return COWORKING_REVIEW_RE.test(String(body ?? ''));
}

export function filterCoworkingReviews(slug, reviews) {
  if (!needsCoworkingReviewFilter(slug)) return reviews;
  return reviews.filter((review) => isCoworkingReviewBody(review?.body));
}

export function coworkingCardStatsFromReviews(reviews) {
  const rated = reviews
    .map((review) => Number(review.rating))
    .filter((value) => Number.isFinite(value) && value > 0);
  const rating = rated.length === 0
    ? null
    : Math.round((rated.reduce((sum, value) => sum + value, 0) / rated.length) * 10) / 10;
  return { reviewCount: reviews.length, ratingCount: rated.length, rating };
}
