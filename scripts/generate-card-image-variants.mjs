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

// Главное фото карточки БЦ (вариант 'detail', <slug>.webp, 1200×1200, в
// среднем 191 КБ) — LCP-элемент страницы здания. Замер 2026-09-23: у
// эмулятора PageSpeed (412 CSS-px, DPR 1,75) фото занимает 378 px — нужно
// 662; на десктопе 437–476 CSS-px при DPR 1. Файл 1200 там избыточен в
// 1,8–2,7 раза, а на медленном 4G его 152 КБ и были основной частью LCP.
// Телефонам с DPR 3 нужен почти весь оригинал (~1000 px) — он и остаётся
// крупнейшим кандидатом srcset. Имена -w<ширина>, чтобы не спутать с
// карточными -card-<ширина>.
const DETAIL_WIDTHS = [480, 720];

async function makeVariants(files, widthsFor, nameFor, resizeFor) {
  let made = 0;
  let skipped = 0;
  let before = 0;
  let after = 0;
  for (const file of files) {
    const src = join(DIR, file);
    before += statSync(src).size;
    for (const width of widthsFor) {
      const out = join(DIR, nameFor(file, width));
      if (existsSync(out) && !force) {
        skipped += 1;
        after += statSync(out).size;
        continue;
      }
      await resizeFor(sharp(src), width).webp({ quality: QUALITY, effort: 6 }).toFile(out);
      after += statSync(out).size;
      made += 1;
    }
  }
  return { made, skipped, before, after };
}

const mb = (n) => (n / 1024 / 1024).toFixed(1);

const cards = readdirSync(DIR).filter((f) => f.endsWith('-card.webp'));
const c = await makeVariants(
  cards,
  WIDTHS,
  (file, w) => file.replace('-card.webp', `-card-${w}.webp`),
  (img, w) => img.resize(w, w, { fit: 'cover' }),
);
console.log(
  `[card-variants] карточки: ${cards.length} фото, создано ${c.made}, пропущено ${c.skipped}; ` +
    `оригиналы ${mb(c.before)} МБ, копии ${mb(c.after)} МБ`,
);

// Исходник detail — <slug>.webp без суффиксов (-card, -card-N, -wN).
const details = readdirSync(DIR).filter((f) => /^[a-z0-9-]+\.webp$/.test(f) && !/-card(-\d+)?\.webp$/.test(f) && !/-w\d+\.webp$/.test(f));
const d = await makeVariants(
  details,
  DETAIL_WIDTHS,
  (file, w) => file.replace(/\.webp$/, `-w${w}.webp`),
  (img, w) => img.resize({ width: w }),
);
console.log(
  `[card-variants] главные фото: ${details.length} фото, создано ${d.made}, пропущено ${d.skipped}; ` +
    `оригиналы ${mb(d.before)} МБ, копии ${mb(d.after)} МБ`,
);
