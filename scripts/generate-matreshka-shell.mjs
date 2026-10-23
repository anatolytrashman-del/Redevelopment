// Генерация шеллов SPA для админки (блок 1):
// - dist/matreshka.html — клиентские хосты «Матрешка» и /platform/* (админка платформы
//   Redevelopment), БЕЗ счётчиков;
// - dist/matreshka-login.html — «/» на redevelopment.pro (вход в админку «Матрешка»),
//   счётчики Метрики/VK СОХРАНЕНЫ (как на остальных страницах redevelopment.pro). Берём готовый dist/404.html (или index.html как фолбэк)
// после vite build и всех prepare-скриптов, в конце build:app.
// Делаем: <title>Матрешка — вход</title>, meta noindex, убираем og-рекламу (чтобы
// мессенджеры не показывали продающую картинку), canonical на redevelopment.pro
// (но на клиентских хостах middleware/верцель отдаст нужное).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripThirdPartyAnalytics } from './stripThirdPartyAnalytics.mjs';

const DIST_DIR = 'dist';
const base404 = join(DIST_DIR, '404.html');
const baseIndex = join(DIST_DIR, 'index.html');
const outPath = join(DIST_DIR, 'matreshka.html');

const basePath = existsSync(base404) ? base404 : baseIndex;
if (!existsSync(basePath)) {
  throw new Error('[generate-matreshka-shell] нет dist/404.html и dist/index.html — запускать в конце build:app');
}

let html = readFileSync(basePath, 'utf8');

const TITLE = 'Матрешка — вход';
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

const escapeAttr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

html = html
  .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(TITLE)}</title>`)
  // убрать/заменить og-рекламу на нейтральное
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1Вход в админку «Матрешка»$2')
  .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1https://redevelopment.pro/og-image.png$2')
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, '$1Вход в админку «Матрешка»$2')
  // заменяем существующий robots (чтобы не дублировать), удаляем canonical
  .replace(/<meta name=["']robots["'][^>]*>/i, NOINDEX)
  .replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, '');

if (!html.includes('noindex')) {
  html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${NOINDEX}`);
}

// Шелл входа на «/» redevelopment.pro: тот же HTML, но счётчики не трогаем.
const loginOutPath = join(DIST_DIR, 'matreshka-login.html');
writeFileSync(loginOutPath, html, 'utf8');
console.log('[generate-matreshka-shell] wrote dist/matreshka-login.html (счётчики сохранены)');

// Удаляем ТОЛЬКО inline-скрипты (без src) с конкретным содержимым (не трогаем main bundle)
html = html.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (m, content) => {
  if (/mc\.yandex|metrika|vk\.com\/rtrg|VK\.Retargeting/i.test(content)) return '';
  return m;
});

// Метрика (__startMetrika) и VK-пиксель (__startTmr, top-fwz1.mail.ru) + их noscript-пиксели —
// на хостах «Матрешки» счётчиков нет (matreshka.html отдаётся только им и /platform/*).
html = stripThirdPartyAnalytics(html);
html = html.replace(/\s*<noscript>(?:(?!<\/noscript>)[\s\S])*?(?:mc\.yandex\.ru|top-fwz1\.mail\.ru)[\s\S]*?<\/noscript>/gi, '');
if (/mc\.yandex\.ru\/(?:metrika|watch)|top-fwz1\.mail\.ru|ym\(111858495/.test(html)) {
  throw new Error('[generate-matreshka-shell] в matreshka.html остались счётчики Метрики/VK');
}

writeFileSync(outPath, html, 'utf8');
console.log('[generate-matreshka-shell] wrote dist/matreshka.html');
