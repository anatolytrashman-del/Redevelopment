// Какие пути честно рендерить в режиме public-refresh (сменился отпечаток
// публичного кода). Вынесено из scripts/prerender.mjs, чтобы покрыть
// юнит-тестами: исключение карточек ТЦ (2026-10-04) дало на проде мигание
// «старый HTML → новый JS» (2026-10-12, карточка «Замок»).

/** Раздел БЦ: /minsk/bc и всё под ним. */
export function isBusinessCenterSectionPath(path) {
  return path === 'minsk/bc' || path.startsWith('minsk/bc/');
}

/** Карточка ТЦ (/minsk/tc/:slug), не хаб with/format/rating/district/metro. */
export function isTradeCenterCardPath(path) {
  if (!path.startsWith('minsk/tc/')) return false;
  const rest = path.slice('minsk/tc/'.length);
  if (!rest || rest.includes('/')) return false;
  return true;
}

/**
 * В режиме public-refresh честно рендерим то, чья разметка могла поменяться
 * из-за правок публичного кода: хабы ТЦ, карточки ТЦ, лендинги, статику.
 * Раздел БЦ по-прежнему копируем с прода (сотни страниц; отдельные хабы
 * в ALWAYS_FULL_RENDER_PATHS рендерятся честно и в быстром режиме).
 * /minsk/tc/store/* в пререндер не входят.
 */
export function needsHonestPublicRefresh(path, { landingPathSet, alwaysFullPaths, staticPaths }) {
  if (isBusinessCenterSectionPath(path)) return false;
  if (path.startsWith('minsk/tc/store/')) return false;
  if (path === 'minsk/tc' || path.startsWith('minsk/tc/')) return true;
  if (alwaysFullPaths.has(path)) return true;
  if (landingPathSet.has(path)) return true;
  if (path === 'minsk' || staticPaths.includes(path)) return true;
  return false;
}
