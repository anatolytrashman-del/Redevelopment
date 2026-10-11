/**
 * Подвал officelist/malllist: «Продукт компании REDEVELOPMENT».
 * Используется в prerender rewrite (копии с платформы + честный рендер).
 */

/**
 * @param {string} platformOrigin например https://redevelopment.pro
 */
export function catalogProductCreditHtml(platformOrigin) {
  return `<p class="leading-relaxed">Продукт компании <a href="${platformOrigin}" data-platform-home="" class="inline-block font-extrabold tracking-wide text-ink hover:opacity-90" rel="noopener noreferrer"><span class="font-black text-primary">RED</span>EVELOPMENT</a></p>`;
}

/** После replaceAll catalog-origin: вернуть href у data-platform-home на платформу. */
export function restorePlatformHomeHrefs(html, platformOrigin) {
  return html
    .replace(
      /(<a\b[^>]*\bdata-platform-home\b[^>]*\bhref=")[^"]*(")/gi,
      `$1${platformOrigin}$2`,
    )
    .replace(
      /(<a\b[^>]*\bhref=")[^"]*("[^>]*\bdata-platform-home\b)/gi,
      `$1${platformOrigin}$2`,
    );
}

/**
 * На копиях с платформы строки ещё нет (там mode=platform).
 * Вставляем в CookieFooterLinks; ссылку всегда оставляем на платформу.
 */
export function ensureCatalogProductCredit(html, platformOrigin) {
  if (html.includes('data-platform-home') || html.includes('Продукт компании')) {
    return restorePlatformHomeHrefs(html, platformOrigin);
  }
  if (!html.includes('ИП Трэшмен')) return html;
  const credit = catalogProductCreditHtml(platformOrigin);
  const withCredit = html.replace(
    /(<div class="flex flex-col items-center gap-2 text-center text-xs text-ink-muted">)(\s*)(<p class="leading-relaxed font-normal">)/,
    `$1$2${credit}$2$3`,
  );
  return restorePlatformHomeHrefs(withCredit, platformOrigin);
}
