import { next, rewrite } from '@vercel/functions';
import {
  crossDomainRedirect,
  robotsSitemapLine,
  CATALOG_DOMAIN_SPLIT_ENABLED,
  normalizeSiteMode,
} from './src/lib/sites';
import {
  MATRESHKA_PREVIEW_FLAG,
  MATRESHKA_TENANT_PARAM,
  isPreviewVercelHost,
  matreshkaSlugForHost,
} from './src/lib/matreshkaHosts.js';
import {
  LOBSTERS_ROBOTS,
  LOBSTERS_STUB_PATH,
  isLobstersHost,
  lobstersPreviewState,
  lobstersRoute,
} from './src/lib/lobsters';


// Vercel Routing Middleware — реальный HTTP 404 для несуществующих страниц.
// Плюс (2026-10-10) междоменные 301 каталогов БЦ/ТЦ на officelist.pro /
// malllist.pro, когда включён domain-split (src/data/domain-split.json).
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
const EXACT_PATHS = new Set<string>([
  '/',
  '/one',
  '/redstorage',
  '/rayon-minsk-mir',
  '/business-upload',
  '/privacy',
  '/offer', // публичная оферта
  '/license/zuev', // индивидуальный договор (noindex, вне sitemap)
  '/requisites', // реквизиты
  '/zakupki', // лендинг модуля закупок (public/zakupki.html + rewrite в vercel.json)
]);

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
  '/pitch', // внутренние презентации (статика в public/pitch/*, noindex)
  '/api', // serverless-функции
  '/_vercel', // Vercel Web Analytics: скрипт и отправка визитов (/_vercel/insights/*)
  '/.well-known', // верификация доменов и т.п. — сейчас не используется, но не должно 404-иться, если появится
  '/platform', // админка платформы Redevelopment (SPA-шелл platform-admin.html)
  '/nl', // статическая страница «участок НЛ» (public/nl/*, noindex; в т.ч. .zip выписок ЕГРН)
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

function edgeVercelEnv(): string {
  const g = (globalThis as any).process?.env || {};
  return typeof g.VERCEL_ENV === 'string' ? g.VERCEL_ENV : '';
}

function requestHost(request: Request): string {
  return request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
}

// Хосты клиента — из общего src/lib/matreshkaHosts.js.
function isMatreshkaClientHost(request: Request): boolean {
  const host = requestHost(request);
  if (matreshkaSlugForHost(host)) return true;
  if (!isPreviewVercelHost(host, edgeVercelEnv())) return false;
  const cookie = request.headers.get('cookie') || '';
  const url = new URL(request.url);
  if (cookie.includes(`${MATRESHKA_PREVIEW_FLAG}=1`) || url.searchParams.get('tenant') === MATRESHKA_TENANT_PARAM) return true;
  return false;
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

const MALLLIST_NOT_FOUND_HTML = NOT_FOUND_HTML
  .replace('— REDEVELOPMENT', '— MallList')
  .replace('<b>RED</b>EVELOPMENT', 'Mall<span style="color:#e4152b">List</span>');

const OFFICELIST_NOT_FOUND_HTML = NOT_FOUND_HTML
  .replace('— REDEVELOPMENT', '— OfficeList')
  .replace('<b>RED</b>EVELOPMENT', 'Office<span style="color:#e4152b">List</span>');

// lobsters.pro (src/lib/lobsters.ts): тот же макет 404, логотип — картинка.
const LOBSTERS_NOT_FOUND_HTML = NOT_FOUND_HTML
  .replace('— REDEVELOPMENT', '— Lobsters')
  .replace(
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="robots" content="noindex, nofollow">\n<link rel="icon" href="/brand/lobsters/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/brand/lobsters/favicon-32.png">\n<link rel="apple-touch-icon" href="/brand/lobsters/apple-touch-icon.png">',
  )
  .replace(
    '<div class="logo"><b>RED</b>EVELOPMENT</div>',
    '<div class="logo"><picture><source type="image/webp" srcset="/brand/lobsters/logo-sm.webp 1x, /brand/lobsters/logo-sm@2x.webp 2x"><img src="/brand/lobsters/logo-sm.png" srcset="/brand/lobsters/logo-sm.png 1x, /brand/lobsters/logo-sm@2x.png 2x" width="192" height="28" alt="Lobsters"></picture></div>',
  );

const LOBSTERS_NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow' };

function lobstersResponse(request: Request, url: URL, host: string): Response | null {
  let previewCookie: string | null = null;
  if (!isLobstersHost(host)) {
    // Превью-симуляция только на *.vercel.app при VERCEL_ENV=preview — на проде не включить.
    if (!isPreviewVercelHost(host, edgeVercelEnv())) return null;
    const state = lobstersPreviewState(url.searchParams, request.headers.get('cookie') || '');
    if (!state.active) {
      if (!state.setCookie) return null;
      // ?brand=off — снять cookie и вернуться на тот же путь уже без бренда Lobsters.
      const clean = new URL(url);
      clean.searchParams.delete('brand');
      return new Response(null, { status: 302, headers: { Location: clean.toString(), 'Set-Cookie': state.setCookie } });
    }
    previewCookie = state.setCookie;
  }
  const action = lobstersRoute(url.pathname, url.search, isLobstersHost(host) ? host : 'lobsters.pro');
  const extra: Record<string, string> = previewCookie ? { 'Set-Cookie': previewCookie } : {};
  switch (action.type) {
    case 'www':
      return new Response(null, { status: 308, headers: { Location: action.location, ...LOBSTERS_NOINDEX } });
    case 'redirect':
      return new Response(null, { status: 301, headers: { Location: action.location, ...LOBSTERS_NOINDEX, ...extra } });
    case 'robots':
      return new Response(LOBSTERS_ROBOTS, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=600', ...LOBSTERS_NOINDEX },
      });
    case 'stub':
      return rewrite(new URL(LOBSTERS_STUB_PATH, url), { headers: { ...LOBSTERS_NOINDEX, ...extra } });
    case 'shell':
      return rewrite(new URL(action.path, url), { headers: { ...LOBSTERS_NOINDEX, ...extra } });
    case 'pass':
      return next({ headers: { ...LOBSTERS_NOINDEX, ...extra } });
    case 'notFound':
    default:
      return new Response(LOBSTERS_NOT_FOUND_HTML, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...LOBSTERS_NOINDEX, ...extra },
      });
  }
}

export const config = {
  runtime: 'edge',
};

const PLATFORM_ROBOTS = `User-agent: *
Disallow: /admin
Disallow: /pitch
Disallow: /*/draft

`;

const CATALOG_ROBOTS = `User-agent: *
Disallow: /admin
Disallow: /api/
Disallow: /pitch
Disallow: /*/draft

`;

/** Пути, которые отдаёт отдельный проект malllist (только каталог ТЦ). */
function isMallsSitePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === '/' || normalized === '') return true;
  if (normalized === '/privacy') return true;
  if (normalized === '/favorites' || normalized.startsWith('/favorites/')) return true;
  if (normalized === '/minsk/tc' || normalized.startsWith('/minsk/tc/')) return true;
  if (normalized === '/api' || normalized.startsWith('/api/')) return true;
  if (normalized === '/_vercel' || normalized.startsWith('/_vercel/')) return true;
  if (normalized === '/.well-known' || normalized.startsWith('/.well-known/')) return true;
  if (
    normalized === '/robots.txt' ||
    normalized === '/sitemap.xml' ||
    normalized === '/sitemap-index.xml' ||
    normalized === '/favicon.ico' ||
    normalized === '/favicon.svg' ||
    normalized === '/favicon.png' ||
    normalized === '/apple-touch-icon.png'
  ) {
    return true;
  }
  return hasKnownStaticExtension(normalized);
}

/** Пути отдельного проекта officelist (каталог БЦ + гид по районам). */
function isOfficesSitePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === '/' || normalized === '') return true;
  if (normalized === '/privacy') return true;
  if (normalized === '/favorites' || normalized.startsWith('/favorites/')) return true;
  if (normalized === '/minsk/bc' || normalized.startsWith('/minsk/bc/')) return true;
  if (normalized === '/minsk/bcminsk' || normalized.startsWith('/minsk/bcminsk/')) return true;
  if (normalized === '/bc' || normalized.startsWith('/bc/')) return true;
  if (normalized === '/minsk/minsk-mir' || normalized.startsWith('/minsk/minsk-mir/')) return true;
  if (normalized === '/rayon-minsk-mir') return true;
  if (normalized === '/api' || normalized.startsWith('/api/')) return true;
  if (normalized === '/_vercel' || normalized.startsWith('/_vercel/')) return true;
  if (normalized === '/.well-known' || normalized.startsWith('/.well-known/')) return true;
  if (
    normalized === '/robots.txt' ||
    normalized === '/sitemap.xml' ||
    normalized === '/sitemap-index.xml' ||
    normalized === '/favicon.ico' ||
    normalized === '/favicon.svg' ||
    normalized === '/favicon.png' ||
    normalized === '/apple-touch-icon.png'
  ) {
    return true;
  }
  return hasKnownStaticExtension(normalized);
}

function edgeSiteMode(): ReturnType<typeof normalizeSiteMode> {
  // Edge: дублируем VITE_PUBLIC_SITE в PUBLIC_SITE на Vercel (см. docs/domain-split.md).
  // Vite-define (__DEPLOYED_SITE_MODE__) сюда не попадает — только process.env.
  const gProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return normalizeSiteMode(gProcess?.env?.PUBLIC_SITE || gProcess?.env?.VITE_PUBLIC_SITE);
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const { pathname } = url;
  const host = request.headers.get('host') ?? url.host;
  const siteMode = edgeSiteMode();
  const normalized = normalizePathname(pathname);

  // Ранняя ветка для клиентских хостов «Матрешка» (блок 1 auth, до siteMode-логики и KNOWN).
  // /api/* + статика → next(); /robots.txt → Disallow; остальное → rewrite на matreshka.html + noindex.
  // Превью-override (cookie/ ?tenant) активен только при VERCEL_ENV=preview (см. _matreshkaTenant).
  if (isMatreshkaClientHost(request)) {
    if (pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=600' },
      });
    }
    const isApiOrStatic =
      normalized.startsWith('/api/') ||
      normalized.startsWith('/_vercel/') ||
      normalized === '/favicon.ico' ||
      hasKnownStaticExtension(normalized);
    if (isApiOrStatic) {
      return next();
    }
    return rewrite(new URL('/matreshka.html', url), {
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  // lobsters.pro (+www, + превью ?brand=lobsters): заглушка, /admin и /platform
  // в бренде Lobsters, остальное — 301 на redevelopment.pro или 404. Только
  // режим platform (проект `redevelopment`); на остальных хостах — null.
  if (siteMode === 'platform') {
    const lobsters = lobstersResponse(request, url, host);
    if (lobsters) return lobsters;
  }

  // Корень сайта — в middleware (не в vercel.json): иначе на malllist
  // старый redirect "/"→"/minsk" из vercel.json срабатывал до Edge.
  // Платформа: / отдаёт главную модулей (PlatformHomePage), без 307.
  // Malllist: / — index.html (meta Вебмастера) + SPA Navigate на /minsk/tc;
  // /minsk → каталог ТЦ.
  //
  // Явный early-return для платформенного корня: раньше здесь был 307→/minsk
  // (oodobu до 2026-10-11). Не возвращать редирект.
  //
  // Preview/Vercel alias: no-store, чтобы браузер не залипал на старом 307→/minsk
  // (владелец, 2026-10-11: «снова старая ссылка» на git-preview).
  const isPlatformRoot =
    siteMode === 'platform' && (normalized === '/' || normalized === '');
  if (isPlatformRoot) {
    return next({
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    });
  }

  if (siteMode === 'malls') {
    if (normalized === '/minsk') {
      return Response.redirect(new URL('/minsk/tc', url), 307);
    }
    if (pathname === '/robots.txt') {
      return new Response(`${CATALOG_ROBOTS}Sitemap: https://malllist.pro/sitemap-index.xml\n`, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=600',
        },
      });
    }
    if (!isMallsSitePath(pathname)) {
      return new Response(MALLLIST_NOT_FOUND_HTML, {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
    return next();
  }

  if (siteMode === 'offices') {
    // / — отдаём index.html (meta yandex-verification для Вебмастера +
    // SPA Navigate на /minsk/bc). 307 с корня ломал HTML-meta проверку.
    if (normalized === '/minsk') {
      return Response.redirect(new URL('/minsk/bc', url), 307);
    }
    if (pathname === '/robots.txt') {
      return new Response(`${CATALOG_ROBOTS}Sitemap: https://officelist.pro/sitemap-index.xml\n`, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=600',
        },
      });
    }
    if (!isOfficesSitePath(pathname)) {
      return new Response(OFFICELIST_NOT_FOUND_HTML, {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
    return next();
  }

  // Междоменные 301 каталогов — раньше 404 и SPA-рерайта, чтобы Google/
  // Яндекс сразу увидели permanent redirect со старого URL.
  const cross = crossDomainRedirect(host, pathname);
  if (cross) {
    return Response.redirect(cross, 301);
  }

  // robots.txt с правильным Sitemap под хост (после включения сплита).
  if (pathname === '/robots.txt' && CATALOG_DOMAIN_SPLIT_ENABLED) {
    const bare = host.replace(/^www\./, '').toLowerCase();
    const body =
      bare === 'officelist.pro' || bare === 'malllist.pro' ? CATALOG_ROBOTS : PLATFORM_ROBOTS;
    return new Response(`${body}${robotsSitemapLine(host)}\n`, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=600',
      },
    });
  }

  // /nl → /nl/: у статической страницы public/nl/index.html относительные пути
  // к assets/img/docs, без хвостового «/» они резолвились бы от корня сайта.
  if (pathname === '/nl') {
    return Response.redirect(new URL('/nl/' + url.search, url), 308);
  }

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
