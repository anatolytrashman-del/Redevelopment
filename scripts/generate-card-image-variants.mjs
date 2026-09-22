// Мелкие варианты карточных фото БЦ (Ш3-c плана docs/bc-catalog-seo-plan.md).
//
// Зачем: карточка каталога отдавала всем один файл 640×640 (~69 КБ в
// среднем, 143 штуки). Замер на живой странице 2026-09-22: на десктопе
// 1440 картинка занимает 241 CSS-px при DPR 1 — то есть 640 пикселей
// шириной там избыточны в 2,7 раза; на телефоне 360/DPR 3 нужно 468.
// PageSpeed владельца оценил потери на этой странице в 1417 КиБ.
//
// Скрипт делает две уменьшенные копии каждого фото, а <img> в PhotoBlock
// раздаёт их через srcset/sizes — браузер сам берёт подходящую. Запускать
// руками после добавления новых фото:
//   npm i --no-save sharp && node scripts/generate-card-image-variants.mjs
// Готовые копии лежат в репозитории (как и сами -card.webp), поэтому сборка
// на Vercel остаётся без sharp и без лишней минуты на пережатие.
//
// --force пересоздаёт уже существующие копии (например если поменялось
// качество), по умолчанию они пропускаются.
import { createRequire } from 'node:module';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('[card-variants] нет sharp — поставь: npm i --no-save sharp');
  process.exit(1);
}

const DIR = 'public/images/business-centers';
// 320 — десктоп при DPR 1 (нужно ~300), 384 — эмулятор PageSpeed
// (412 CSS-px при DPR 1,75 просит 324) и телефоны с DPR 2, 512 — телефон
// при DPR 3 (~486). Оригинал 640 остаётся крупнейшим кандидатом: планшет
// при DPR 2 просит 680. Промежуточная ширина добавлена 2026-09-22 по
// второму отчёту владельца: без неё устройства, которым нужно 324-384 px,
// тянули 512-й файл, вдвое тяжелее необходимого.
const WIDTHS = [320, 384, 512];
// Исходники прогнаны TinyPNG, их повторное кодирование при q75 давало
// всего −7 % — значит закодированы примерно так же. Для уменьшенных копий
// берём чуть ниже: на размере показа разницы не видно (сверял кадры), а
// файл легче ещё на десятую часть.
const QUALITY = 74;

const force = process.argv.includes('--force');
const cards = readdirSync(DIR).filter((f) => f.endsWith('-card.webp'));
let made = 0;
let skipped = 0;
let bytesBefore = 0;
let bytesAfter = 0;

for (const file of cards) {
  const src = join(DIR, file);
  bytesBefore += statSync(src).size;
  for (const width of WIDTHS) {
    const out = join(DIR, file.replace('-card.webp', `-card-${width}.webp`));
    if (existsSync(out) && !force) {
      skipped += 1;
      bytesAfter += statSync(out).size;
      continue;
    }
    await sharp(src).resize(width, width, { fit: 'cover' }).webp({ quality: QUALITY, effort: 6 }).toFile(out);
    bytesAfter += statSync(out).size;
    made += 1;
  }
}

console.log(
  `[card-variants] фото: ${cards.length}, создано копий: ${made}, пропущено: ${skipped}\n` +
    `[card-variants] оригиналы ${(bytesBefore / 1024 / 1024).toFixed(1)} МБ, копии ${(bytesAfter / 1024 / 1024).toFixed(1)} МБ`,
);
