/**
 * Снапшот пререндера и первый кадр hydrateRoot должны совпасть по дереву.
 * Иначе React 19 пишет ошибку #418 и пересобирает страницу на клиенте —
 * LCP переезжает с готового HTML на момент выполнения бандла.
 */

/** Внутренность одного корневого элемента, снятого как outerHTML. */
export function innerHtmlOfRoot(outer: string, tag: string): string | null {
  const trimmed = outer.trim();
  const match = trimmed.match(new RegExp(`^<${tag}\\b[^>]*>([\\s\\S]*)<\\/${tag}>$`, 'i'));
  return match ? match[1] : null;
}
