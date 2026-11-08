/**
 * Снапшот пререндера и первый кадр hydrateRoot должны совпасть по дереву.
 * Иначе React 19 пишет ошибку #418 и пересобирает страницу на клиенте —
 * LCP переезжает с готового HTML на момент выполнения бандла.
 */

/**
 * Гидрация browse-home только на `/` и `/minsk/tc` без `?view=list`.
 * Список по query рисует другие блоки, чем полки в снапшоте.
 */
export function isMalllistBrowseHomeUrl(pathname: string, search: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path !== '/' && path !== '/minsk/tc') return false;
  const query = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(query).get('view') !== 'list';
}

/** Внутренность одного корневого элемента, снятого как outerHTML. */
export function innerHtmlOfRoot(outer: string, tag: string): string | null {
  const trimmed = outer.trim();
  const match = trimmed.match(new RegExp(`^<${tag}\\b[^>]*>([\\s\\S]*)<\\/${tag}>$`, 'i'));
  return match ? match[1] : null;
}
