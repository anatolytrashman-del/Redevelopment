/**
 * Подсветка пункта «каталог» в шапке.
 * Корень malllist.pro — это копия снапшота /minsk/tc (sync-catalog-root-shell),
 * и в том HTML пункт уже активен. На «/» клиент обязан поставить тот же class:
 * другой className на кнопке расходится с гидрацией.
 * Officelist здесь не трогаем.
 */
export function isCatalogSectionPath(pathname: string, basePath: string, siteMode: string): boolean {
  if (pathname === basePath || pathname.startsWith(`${basePath}/`) || pathname.startsWith('/favorites/')) {
    return true;
  }
  return siteMode === 'malls' && (pathname === '/' || pathname === '');
}
