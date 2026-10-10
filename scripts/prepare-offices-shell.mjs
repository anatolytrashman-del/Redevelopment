// Патчит dist/index.html под отдельный проект officelist (PUBLIC_SITE=offices):
// title/description/og/canonical/JSON-LD/favicon вместо фолбэка Red One.
// После vite build + defer-entry-script, до пререндера.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOYED_SITE_MODE, OFFICES_ORIGIN } from './domainSplit.mjs';
import { stripThirdPartyAnalytics } from './stripThirdPartyAnalytics.mjs';

if (DEPLOYED_SITE_MODE !== 'offices') {
  process.exit(0);
}

const DIST_DIR = 'dist';
const indexPath = join(DIST_DIR, 'index.html');
if (!existsSync(indexPath)) {
  throw new Error('[prepare-offices-shell] нет dist/index.html — запускать после vite build');
}

const TITLE = 'OfficeList — каталог бизнес-центров Минска';
const DESCRIPTION =
  'Каталог бизнес-центров Минска: классы, районы, метро, улицы. Карточки объектов и подборки.';
const URL = `${OFFICES_ORIGIN}/minsk/bc`;
const ASSET_V = '20261010o2';
const domainSplit = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/domain-split.json'), 'utf8'),
);
const YANDEX_VERIFICATION = domainSplit.verifications?.offices?.yandex || '';

const escapeAttr = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let html = readFileSync(indexPath, 'utf8');
html = html
  .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(TITLE)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`);

if (YANDEX_VERIFICATION) {
  if (/<meta name="yandex-verification"/.test(html)) {
    html = html.replace(
      /(<meta name="yandex-verification" content=")[^"]*(")/,
      `$1${YANDEX_VERIFICATION}$2`,
    );
  } else {
    html = html.replace(
      '</head>',
      `<meta name="yandex-verification" content="${escapeAttr(YANDEX_VERIFICATION)}" />\n</head>`,
    );
  }
} else {
  // Не оставляем meta платформы (redevelopment) на чужом домене.
  html = html.replace(/\s*<meta name="yandex-verification" content="[^"]*"\s*\/?>/i, '');
}

html = html
  .replace(/(<meta property="og:site_name" content=")[^"]*(")/, '$1OfficeList$2')
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeAttr(URL)}$2`)
  .replace(
    /(<meta property="og:image" content=")[^"]*(")/,
    `$1${escapeAttr(`${OFFICES_ORIGIN}/og-image.png`)}$2`,
  )
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(
    /(<meta name="twitter:image" content=")[^"]*(")/,
    `$1${escapeAttr(`${OFFICES_ORIGIN}/og-image.png`)}$2`,
  )
  .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeAttr(URL)}$2`)
  .replace(
    /<link rel="icon" href="\/favicon\.ico"[^>]*>/,
    `<link rel="icon" href="/favicon.ico?v=${ASSET_V}" sizes="any" />`,
  )
  .replace(
    /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"[^>]*>/,
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=${ASSET_V}" />`,
  )
  .replace(
    /<link rel="icon" type="image\/png" href="\/favicon\.png"[^>]*>/,
    `<link rel="icon" type="image/png" href="/favicon.png?v=${ASSET_V}" />`,
  )
  .replace(
    /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"[^>]*>/,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${ASSET_V}" />`,
  )
  .replace(
    /(<script type="application\/ld\+json" id="organization-json-ld">)[\s\S]*?(<\/script>)/,
    `$1${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'OfficeList',
      url: OFFICES_ORIGIN,
      description: DESCRIPTION,
    })}$2`,
  )
  .replace(/(<script type="application\/ld\+json" id="object-json-ld">)[\s\S]*?(<\/script>)/, '$1$2')
  .replace(
    /<div id="root">[\s\S]*?<\/div>/,
    `<div id="root"><h1>${escapeHtml(TITLE)}</h1><p>${escapeHtml(DESCRIPTION)}</p><p><a href="/minsk/bc">Каталог Минска</a></p></div>`,
  );

html = stripThirdPartyAnalytics(html);

writeFileSync(indexPath, html);
writeFileSync(join(DIST_DIR, '404.html'), html);
console.log('[prepare-offices-shell] dist/index.html и 404.html — meta OfficeList, без Метрики/VK');
