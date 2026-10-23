// Генерация dist/osnova.html — статического шелла для клиентской админки «Основа»
// и /platform/* (блок 1). Берём готовый dist/404.html (или index.html как фолбэк)
// после vite build и всех prepare-скриптов, в конце build:app.
// Делаем: <title>Основа — вход</title>, meta noindex, убираем og-рекламу (чтобы
// мессенджеры не показывали продающую картинку), canonical на redevelopment.pro
// (но на клиентских хостах middleware/верцель отдаст нужное).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = 'dist';
const base404 = join(DIST_DIR, '404.html');
const baseIndex = join(DIST_DIR, 'index.html');
const outPath = join(DIST_DIR, 'osnova.html');

const basePath = existsSync(base404) ? base404 : baseIndex;
if (!existsSync(basePath)) {
  throw new Error('[generate-osnova-shell] нет dist/404.html и dist/index.html — запускать в конце build:app');
}

let html = readFileSync(basePath, 'utf8');

const TITLE = 'Основа — вход';
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

const escapeAttr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

html = html
  .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(TITLE)}</title>`)
  // убрать/заменить og-рекламу на нейтральное
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1Вход в клиентскую админку redevelopment$2')
  .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1https://redevelopment.pro/og-image.png$2')
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(TITLE)}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, '$1Вход в клиентскую админку redevelopment$2')
  // заменяем существующий robots (чтобы не дублировать), удаляем canonical
  .replace(/<meta name=["']robots["'][^>]*>/i, NOINDEX)
  .replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, '');

if (!html.includes('noindex')) {
  html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${NOINDEX}`);
}

// Удаляем ТОЛЬКО inline-скрипты (без src) с конкретным содержимым (не трогаем main bundle)
html = html.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (m, content) => {
  if (/mc\.yandex|metrika|vk\.com\/rtrg|VK\.Retargeting/i.test(content)) return '';
  return m;
});

writeFileSync(outPath, html, 'utf8');
console.log('[generate-osnova-shell] wrote dist/osnova.html');
