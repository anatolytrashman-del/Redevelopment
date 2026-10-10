// Убирает Яндекс.Метрику и VK-пиксель из HTML каталожных проектов
// (malllist / officelist). На этих доменах считает только свой счётчик
// pageViewTracker → page_views_daily (колонка site).
// Vercel Web Analytics оставляем — у каждого Vercel-проекта свой.
//
// Якорь на URL счётчика, а не на первый `};`: иначе non-greedy матч может
// схватить соседний __startAnalytics, если тело уже было пустым.

/**
 * @param {string} html
 * @returns {string}
 */
export function stripThirdPartyAnalytics(html) {
  let out = html;
  if (out.includes('mc.yandex.ru/metrika') || out.includes('111858495')) {
    out = out.replace(
      /window\.__startMetrika\s*=\s*function\s*\(\)\s*\{[\s\S]*?ym\(111858495[\s\S]*?\n\s*\};/,
      'window.__startMetrika = function () {};',
    );
    out = out.replace(
      /\s*<noscript><div><img src="https:\/\/mc\.yandex\.ru\/watch\/111858495"[^>]*><\/div><\/noscript>/g,
      '',
    );
  }
  if (out.includes('top-fwz1.mail.ru') || out.includes('3793248')) {
    out = out.replace(
      /window\.__startTmr\s*=\s*function\s*\(\)\s*\{[\s\S]*?top-fwz1\.mail\.ru[\s\S]*?\n\s*\};/,
      'window.__startTmr = function () {};',
    );
    out = out.replace(
      /\s*<noscript><div><img src="https:\/\/top-fwz1\.mail\.ru\/counter[^"]*"[^>]*><\/div><\/noscript>/g,
      '',
    );
  }
  return out;
}
