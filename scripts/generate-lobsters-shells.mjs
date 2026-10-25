// Шеллы SPA для lobsters.pro (src/lib/lobsters.ts, middleware.ts):
//   dist/lobsters-admin.html    — /admin/* на хосте lobsters.pro;
//   dist/lobsters-platform.html — /platform/* на хосте lobsters.pro.
// База — dist/platform-admin.html (generate-matreshka-shell.mjs): уже без
// Метрики/VK, noindex, без canonical. Меняем title/OG/twitter/favicon на
// Lobsters и выставляем window.__SITE_BRAND__ = 'lobsters' до бандла, чтобы
// React сразу рисовал логотип Lobsters (src/lib/siteBrand.ts).
// redevelopment.pro и его шеллы не трогаем. Запускать в самом конце build:app.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = 'dist';

const ORIGIN = 'https://lobsters.pro';
const OG_IMAGE = `${ORIGIN}/brand/lobsters/og.png`;
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';
const ICONS = [
  '<link rel="icon" href="/brand/lobsters/favicon.ico" sizes="any" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/brand/lobsters/favicon-32.png" />',
  '<link rel="icon" type="image/png" sizes="16x16" href="/brand/lobsters/favicon-16.png" />',
  '<link rel="apple-touch-icon" href="/brand/lobsters/apple-touch-icon.png" />',
].join('\n    ');

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function lobstersShell(html, { title, description, path }) {
  let out = html
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta property="og:site_name" content=")[^"]*(")/, '$1Lobsters$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${OG_IMAGE}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${ORIGIN}${path}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${OG_IMAGE}$2`)
    .replace(/<meta name=["']robots["'][^>]*>/i, NOINDEX)
    .replace(/<link[^>]*rel=["']canonical["'][^>]*>\s*/gi, '');
  // og:image:alt / twitter:image:alt, если есть
  out = out.replace(/(<meta (?:property|name)="(?:og|twitter):image:alt" content=")[^"]*(")/g, '$1Lobsters$2');
  // Все favicon/apple-touch ссылки Redevelopment → один блок Lobsters.
  let iconsInserted = false;
  out = out.replace(/[ \t]*<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>\s*/gi, () => {
    if (iconsInserted) return '';
    iconsInserted = true;
    return `    ${ICONS}\n    `;
  });
  if (!iconsInserted) out = out.replace(/<\/head>/i, `    ${ICONS}\n  </head>`);
  if (!out.includes('noindex')) out = out.replace(/<head[^>]*>/i, (m) => `${m}\n    ${NOINDEX}`);
  out = out.replace(/(<meta name="theme-color" content=")[^"]*(")/, '$1#E30129$2');
  const brandScript = `<script>window.__SITE_BRAND__='lobsters';</script>`;
  out = out.replace(/<head[^>]*>/i, (m) => `${m}\n    ${brandScript}`);
  return out;
}

const shells = [
  { file: 'lobsters-admin.html', title: 'Админка Lobsters', description: 'Вход в админку Lobsters', path: '/admin' },
  { file: 'lobsters-platform.html', title: 'Lobsters — платформа', description: 'Вход в админку платформы Lobsters', path: '/platform' },
];

if (process.argv[1] && process.argv[1].endsWith('generate-lobsters-shells.mjs')) {
  const basePath = join(DIST_DIR, 'platform-admin.html');
  if (!existsSync(basePath)) {
    throw new Error('[generate-lobsters-shells] нет dist/platform-admin.html — запускать после generate-matreshka-shell.mjs');
  }
  const base = readFileSync(basePath, 'utf8');
  for (const s of shells) {
    const html = lobstersShell(base, s);
    if (!html.includes("__SITE_BRAND__='lobsters'") || !html.includes('/brand/lobsters/favicon.ico')) {
      throw new Error(`[generate-lobsters-shells] ${s.file}: не применился бренд`);
    }
    if (/mc\.yandex\.ru\/(?:metrika|watch)|top-fwz1\.mail\.ru|ym\(111858495/.test(html)) {
      throw new Error(`[generate-lobsters-shells] ${s.file}: остались счётчики`);
    }
    writeFileSync(join(DIST_DIR, s.file), html, 'utf8');
    console.log(`[generate-lobsters-shells] wrote dist/${s.file}`);
  }
}
