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

/** Реквизиты ИП в подвале каталогов не показываем (владелец, 2026-10-11). */
export function stripCatalogOperatorRequisites(html) {
  return html.replace(
    /\s*<p class="leading-relaxed font-normal">\s*ИП Трэшмен Анатолий[\s\S]*?ИНН\s*[\d\s]+<\/p>/g,
    '',
  );
}

/**
 * На копиях с платформы / старых снапшотах строки ещё нет.
 * Вставляем «Продукт компании», убираем ИП; ссылку — на платформу.
 */
export function ensureCatalogProductCredit(html, platformOrigin) {
  let out = html;
  if (!(out.includes('data-platform-home') || out.includes('Продукт компании'))) {
    const credit = catalogProductCreditHtml(platformOrigin);
    // Актуальный CookieFooterLinks: обёртка + реквизиты ИП (потом снимем).
    if (out.includes('ИП Трэшмен')) {
      const withCredit = out.replace(
        /(<div class="flex flex-col items-center gap-2 text-center text-xs text-ink-muted">)(\s*)(<p class="leading-relaxed font-normal">)/,
        `$1$2${credit}$2$3`,
      );
      if (withCredit !== out) out = withCredit;
    } else if (out.includes('Политика конфиденциальности')) {
      // Старый подвал (только privacy/cookie) — как на копиях malllist.
      const withCredit = out.replace(
        /(<p class="text-xs text-ink-muted">\s*<a\b[^>]*>Политика конфиденциальности)/,
        `${credit}$1`,
      );
      if (withCredit !== out) out = withCredit;
    }
  }
  out = stripCatalogOperatorRequisites(out);
  return restorePlatformHomeHrefs(out, platformOrigin);
}
