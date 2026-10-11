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
 * На копиях с платформы / старых снапшотах строки ещё нет.
 * Вставляем в CookieFooterLinks (новый и старый вид); ссылку — на платформу.
 */
export function ensureCatalogProductCredit(html, platformOrigin) {
  if (html.includes('data-platform-home') || html.includes('Продукт компании')) {
    return restorePlatformHomeHrefs(html, platformOrigin);
  }
  const credit = catalogProductCreditHtml(platformOrigin);
  // Актуальный CookieFooterLinks: обёртка + реквизиты ИП.
  if (html.includes('ИП Трэшмен')) {
    const withCredit = html.replace(
      /(<div class="flex flex-col items-center gap-2 text-center text-xs text-ink-muted">)(\s*)(<p class="leading-relaxed font-normal">)/,
      `$1$2${credit}$2$3`,
    );
    if (withCredit !== html) return restorePlatformHomeHrefs(withCredit, platformOrigin);
  }
  // Старый подвал (только privacy/cookie в одном <p>) — как на копиях malllist.
  if (html.includes('Политика конфиденциальности')) {
    const withCredit = html.replace(
      /(<p class="text-xs text-ink-muted">\s*<a\b[^>]*>Политика конфиденциальности)/,
      `${credit}$1`,
    );
    if (withCredit !== html) return restorePlatformHomeHrefs(withCredit, platformOrigin);
  }
  return html;
}
