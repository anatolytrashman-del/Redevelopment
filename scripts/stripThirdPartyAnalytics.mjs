// Убирает Яндекс.Метрику и VK-пиксель из dist/index.html каталожных
// проектов (malllist / officelist). На этих доменах считает только свой
// счётчик pageViewTracker → page_views_daily (колонка site).
// Vercel Web Analytics оставляем — у каждого Vercel-проекта свой.

/**
 * @param {string} html
 * @returns {string}
 */
export function stripThirdPartyAnalytics(html) {
  return html
    .replace(/window\.__startMetrika = function \(\) \{[\s\S]*?\n\s*\};/, 'window.__startMetrika = function () {};')
    .replace(/window\.__startTmr = function \(\) \{[\s\S]*?\n\s*\};/, 'window.__startTmr = function () {};')
    .replace(
      /\s*<noscript><div><img src="https:\/\/mc\.yandex\.ru\/watch\/111858495"[^>]*><\/div><\/noscript>/g,
      '',
    )
    .replace(
      /\s*<noscript><div><img src="https:\/\/top-fwz1\.mail\.ru\/counter[^"]*"[^>]*><\/div><\/noscript>/g,
      '',
    );
}
