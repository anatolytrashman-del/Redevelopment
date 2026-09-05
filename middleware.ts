import { next } from '@vercel/functions';

// Vercel Routing Middleware — реальный HTTP 404 для несуществующих страниц.
//
// 2026-09-06: Яндекс.Вебмастер пожаловался, что ЛЮБОЙ путь (в т.ч. заведомо
// несуществующий) отдаёт 200 — см. комментарий в src/pages/NotFound.tsx.
// Причина — vercel.json делает общий SPA-рерайт "/(.*)" -> "/index.html",
// без него сломалась бы прямая навигация на реальные клиентские роуты
// (/minsk/one, /admin/... и т.п.). Это ограничение любой SPA без SSR на
// статическом хостинге, не решить одной правкой vercel.json — нужен код,
// который выполняется РАНЬШЕ рерайта и знает, какие пути реальны.
//
// Routing Middleware выполняется до применения rewrites/redirects из
// vercel.json (см. https://vercel.com/docs/routing-middleware — "executes
// code before a request is processed on a site"). Для заведомо валидных
// префиксов вызываем next() — запрос идёт дальше по обычному пути (общий
// SPA-рерайт на index.html, отдельные *.html-шеллы токен-страниц, statика).
// Для всего остального — настоящий Response со статусом 404, без падения в
// SPA-рерайт вовсе.
//
// Источник правды по реальным маршрутам — src/App.tsx (<Route path=...>).
// При добавлении НОВОГО топ-левел раздела (не под уже покрытым префиксом
// вроде /minsk или /admin) не забыть завести для него запись здесь же.

// Единственные два "голых" легаси-слага, которые реально существовали до
// переезда на city-scoped структуру /minsk/... (2026-08-23) — у обоих уже
// есть постоянный redirect в vercel.json. Любой другой одиночный сегмент
// (`/foo`, `/this-page-does-not-exist-xyz123`) — не настоящий маршрут:
// общий клиентский `<Route path="/:legacySlug">` в App.tsx это лишь
// backward-compat подстраховка на случай появления новых слагов ТАКОГО ЖЕ
// старого паттерна, а не признак того, что такой путь существует сегодня.
const EXACT_PATHS = new Set<string>(['/', '/one', '/redstorage', '/rayon-minsk-mir', '/business-upload']);

// Префиксы реальных разделов (без хвостового "/" — сравниваем через
// `=== prefix` или `startsWith(prefix + '/')`, см. isKnownPath).
const KNOWN_PREFIXES = [
  '/minsk', // хаб + гид района + бизнес-центры + лендинги объектов (/minsk/:slug)
  '/admin', // вся CRM за PasswordGate
  '/tz', // /tz/:token — публичное ТЗ
  '/estimate', // /estimate/:token — публичная смета для строителя
  '/plan', // /plan/:token — публичная планировка/бронирование
  '/summary', // /summary/:token — публичное саммери встречи
  '/api', // serverless-функции
  '/.well-known', // верификация доменов и т.п. — сейчас не используется, но не должно 404-иться, если появится
];

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

// Статика (собранные JS/CSS-чанки, шрифты, картинки, favicon, robots.txt,
// sitemap.xml, tz.html/estimate.html/... шеллы) — последний сегмент пути
// оканчивается на одно из реально используемых на сайте расширений. Vercel
// и так отдаёт реальные файлы из filesystem раньше любых rewrites (см.
// документацию по rewrites — "precedence is given to the filesystem prior
// to rewrites being applied"), но это не освобождает от явной проверки
// здесь: middleware выполняется ДО того шага, и без этого правила статика
// тоже попала бы под 404-ветку. Список расширений намеренно ограничен (не
// "любой суффикс из точки и букв") — иначе типичные боты-пробники вроде
// /wp-login.php или /.env тоже молча получали бы 200 через общий SPA-
// рерайт, ровно та же проблема, из-за которой затевалась эта правка.
const STATIC_FILE_EXTENSIONS = new Set([
  'html', 'js', 'mjs', 'css', 'map', 'json', 'xml', 'txt',
  'ico', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
  'ttf', 'woff', 'woff2', 'otf', 'pdf',
]);

function hasKnownStaticExtension(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0) return false;
  return STATIC_FILE_EXTENSIONS.has(lastSegment.slice(dotIndex + 1).toLowerCase());
}

function isKnownPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (EXACT_PATHS.has(normalized)) return true;
  if (KNOWN_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix + '/'))) {
    return true;
  }
  return hasKnownStaticExtension(normalized);
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Страница не найдена — REDEVELOPMENT</title>
<style>
  html,body{margin:0;height:100%;background:#0b0b0c;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  body{display:flex;align-items:center;justify-content:center;text-align:center}
  .logo{font-size:1.125rem;font-weight:800;letter-spacing:.02em}
  .logo b{color:#e11d3c;font-weight:900}
  p{margin:.5rem 0 0;font-size:.875rem;color:#a1a1aa}
</style>
</head>
<body>
  <div>
    <div class="logo"><b>RED</b>EVELOPMENT</div>
    <p>Страница не найдена.</p>
  </div>
</body>
</html>
`;

export const config = {
  runtime: 'edge',
};

export default function middleware(request: Request) {
  const { pathname } = new URL(request.url);

  if (isKnownPath(pathname)) {
    return next();
  }

  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
