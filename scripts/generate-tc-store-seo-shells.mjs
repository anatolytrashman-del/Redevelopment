// SEO-шеллы подборок «ТЦ с магазином X» (/minsk/tc/store/<slug>).
//
// 2026-10-07: подборки организаций/арендаторов выведены из индекса
// (sitemap без /store/*, X-Robots-Tag noindex в vercel.json, setNoIndex на
// странице). Раньше скрипт клонировал index.html в ~7 тыс. dist/.../store/
// с index,follow — это раздувало sitemap до ~7540 URL и давало дубли вроде
// 100-den/100den. Сборку больше не вызываем (убран из build:app); скрипт
// оставлен как no-op на случай ручного запуска.
//
// Фильтр «магазин в ТЦ» в каталоге и роут /minsk/tc/store/:slug остаются —
// страницы открываются пользователям, в поиск не зовём.
console.log(
  '[tc-store-seo-shells] пропуск: /minsk/tc/store/* вне индекса (noindex + нет в sitemap)',
);
process.exit(0);
