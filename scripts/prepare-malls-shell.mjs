// Патчит dist/index.html под отдельный проект malllist (PUBLIC_SITE=malls):
// title/description/og/canonical/JSON-LD/yandex-verification/favicon вместо
// фолбэка Red One. После vite build + defer-entry-script, до пререндера.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOYED_SITE_MODE, MALLS_ORIGIN } from './domainSplit.mjs';
import { stripThirdPartyAnalytics } from './stripThirdPartyAnalytics.mjs';

if (DEPLOYED_SITE_MODE !== 'malls') {
  process.exit(0);
}

const DIST_DIR = 'dist';
const indexPath = join(DIST_DIR, 'index.html');
if (!existsSync(indexPath)) {
  throw new Error('[prepare-malls-shell] нет dist/index.html — запускать после vite build');
}

const TITLE = 'MallList — каталог торговых центров';
const DESCRIPTION =
  'Каталог торговых центров по городам. Карточки объектов, подборки, карта — начиная с Минска.';
const URL = `${MALLS_ORIGIN}/minsk/tc`;
const ASSET_V = '20261010m2';
const domainSplit = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/domain-split.json'), 'utf8'),
);
const YANDEX_VERIFICATION = domainSplit.verifications?.malls?.yandex || '5893ee662c25f112';

const escapeAttr = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let html = readFileSync(indexPath, 'utf8');
html = html
  .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(TITLE)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(
    /(<meta name="yandex-verification" content=")[^"]*(")/,
    `$1${YANDEX_VERIFICATION}$2`,
  )
  .replace(/(<meta property="og:site_name" content=")[^"]*(")/, '$1MallList$2')
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeAttr(URL)}$2`)
  .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${escapeAttr(`${MALLS_ORIGIN}/og-image.png`)}$2`)
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${escapeAttr(`${MALLS_ORIGIN}/og-image.png`)}$2`)
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
      name: 'MallList',
      url: MALLS_ORIGIN,
      description: DESCRIPTION,
    })}$2`,
  )
  .replace(
    /(<script type="application\/ld\+json" id="object-json-ld">)[\s\S]*?(<\/script>)/,
    '$1$2',
  )
  // h1 в #root — сигнал ботам без JS и запасной снапшот, если headless
  // главной не поднялся. React сносит #root при монтировании.
  .replace(
    /<div id="root">[\s\S]*?<\/div>/,
    `<div id="root"><h1>${escapeHtml(TITLE)}</h1><p>${escapeHtml(DESCRIPTION)}</p><p><a href="/minsk/tc">Каталог торговых центров Минска</a></p></div>`,
  );

html = stripThirdPartyAnalytics(html);

writeFileSync(indexPath, html);
writeFileSync(join(DIST_DIR, '404.html'), html);
console.log('[prepare-malls-shell] dist/index.html и 404.html — meta MallList + yandex-verification, без Метрики/VK');
