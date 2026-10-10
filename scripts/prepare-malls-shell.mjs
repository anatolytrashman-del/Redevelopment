// Патчит dist/index.html под отдельный проект malllist (PUBLIC_SITE=malls):
// title/description/og/canonical/JSON-LD вместо фолбэка Red One.
// Запускать после vite build + defer-entry-script, до пререндера и store-шеллов.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEPLOYED_SITE_MODE, MALLS_ORIGIN } from './domainSplit.mjs';

if (DEPLOYED_SITE_MODE !== 'malls') {
  process.exit(0);
}

const DIST_DIR = 'dist';
const indexPath = join(DIST_DIR, 'index.html');
if (!existsSync(indexPath)) {
  throw new Error('[prepare-malls-shell] нет dist/index.html — запускать после vite build');
}

const TITLE = 'MallList — независимый каталог торговых центров';
const DESCRIPTION =
  'Независимый каталог торговых центров. Факты по объектам — не рекламная выдача. Сейчас открыт Минск.';
const URL = `${MALLS_ORIGIN}/`;

const escapeAttr = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let html = readFileSync(indexPath, 'utf8');
html = html
  .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(TITLE)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(/(<meta property="og:site_name" content=")[^"]*(")/, '$1MallList$2')
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeAttr(URL)}$2`)
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeAttr(DESCRIPTION)}$2`)
  .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeAttr(URL)}$2`)
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
  );

writeFileSync(indexPath, html);
// 404-шелл тоже с правильным брендом (копия index до пререндера корня).
writeFileSync(join(DIST_DIR, '404.html'), html);
console.log('[prepare-malls-shell] dist/index.html и 404.html — meta MallList');
