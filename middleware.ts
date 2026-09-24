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
  '/favorites', // /favorites/:id — публичная ссылка на избранное без регистрации
  '/bc', // /bc/:slug — карточка БЦ для ссылки с сайта самого здания (vercel.json → пререндер /minsk/bc/:slug)
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

// Обычный HTML/CSS, не JSX — edge middleware выполняется до сборки React,
// импортировать сюда компонент из src/pages/NotFound.tsx нельзя. Держать
// внешний вид в паре с ним вручную (тот же значок, тот же текст, ссылка на
// главную), см. 2026-09-20 в docs/session-journal.md — до этой правки здесь
// был совсем другой, тёмный дизайн без единой ссылки на сайт, и никто не
// заметил, что src/pages/NotFound.tsx его не покрывает: тот компонент рендерится
// только когда путь ПРОШЁЛ проверку isKnownPath (например, /minsk/несуществующий-раздел),
// а любой путь вне KNOWN_PREFIXES/EXACT_PATHS до React вообще не доходит —
// ответ формирует целиком эта строка.
const NOT_FOUND_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Страница не найдена — REDEVELOPMENT</title>
<style>
  html,body{margin:0;height:100%;background:#f0efed;color:#14151a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  body{display:flex;align-items:center;justify-content:center;text-align:center;padding:0 1rem}
  .wrap{display:flex;flex-direction:column;align-items:center;gap:1.5rem}
  .icon{display:flex;align-items:center;justify-content:center;width:5rem;height:5rem;border-radius:9999px;background:#fde3e5}
  .logo{font-size:1.125rem;font-weight:800;letter-spacing:.02em}
  .logo b{color:#e4152b;font-weight:900}
  h1{margin:.5rem 0 0;font-size:1.5rem;font-weight:800}
  p{margin:.5rem 0 0;max-width:24rem;font-size:.875rem;color:#6b6d76}
  a{display:inline-flex;align-items:center;gap:.5rem;margin-top:.5rem;padding:.75rem 1.5rem;border-radius:9999px;background:#e4152b;color:#fff;font-size:.875rem;font-weight:600;text-decoration:none}
  a:hover{background:#c81124}
</style>
</head>
<body>
  <div class="wrap">
    <span class="icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e4152b" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="m13.5 8.5-5 5"/>
        <path d="m8.5 8.5 5 5"/>
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.3-4.3"/>
      </svg>
    </span>
    <div>
      <div class="logo"><b>RED</b>EVELOPMENT</div>
      <h1>Страница не найдена</h1>
      <p>Такой страницы не существует или она была перемещена. Возможно, ссылка устарела или в адресе есть ошибка.</p>
    </div>
    <a href="/">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9.5 12 3l9 6.5"/>
        <path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10"/>
      </svg>
      На главную
    </a>
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
