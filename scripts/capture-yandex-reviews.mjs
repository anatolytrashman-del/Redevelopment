#!/usr/bin/env node
// Полуавтоматический сбор ТЕКСТОВЫХ отзывов с Яндекс.Карт — браузером на
// машине владельца, тем же профилем Chrome, что у сбора организаций
// (scripts/capture-yandex-bc-tenants.mjs) и инфраструктуры рядом
// (scripts/capture-yandex-nearby.mjs). НЕ запускать одновременно с ними:
// Chrome блокирует второй процесс на тот же --profile (профиль общий,
// tmp/yandex-maps-profile, — запускать по очереди, не параллельно.
//
// Почему не тот же визит, что у инфраструктуры/организаций: те два скрипта
// открывают либо область вокруг координат (поиск кафе/аптек), либо
// toponym-страницу адреса («Организации внутри»). Отзывы (.business-review-view)
// лежат только на вкладке «Отзывы» СОБСТВЕННОЙ карточки организации этого
// БЦ на Яндекс.Карте — третья, отдельная страница, её адрес заранее не
// известен (в базе не хранится), поэтому без человека не обойтись: скрипт
// открывает поиск по НАЗВАНИЮ БЦ и ждёт Enter — владелец кликает на нужную
// организацию и открывает саму вкладку «Отзывы» (та же логика, что уже
// работает в capture-yandex-bc-tenants.mjs для «Организации внутри»).
// Дальше — снова автоматика: скролл до конца списка и запись в базу.
//
// Разбор карточки — СЕЛЕКТОРЫ-БЛИЗНЕЦЫ (см. правило CLAUDE.md про парные
// файлы) с src/lib/businessCenterSnapshotParser.ts::extractReviewsFromHtml —
// той же функцией, что разбирает вручную сохранённый .webarchive при
// загрузке в админке. Править список полей — сразу в обоих местах, иначе
// ручной путь и этот скрипт после правки Яндексом вёрстки начнут
// расходиться в данных молча.
//
// Запуск:
//   node scripts/capture-yandex-reviews.mjs --list
//        — какие БЦ попадут в очередь, без браузера;
//   node scripts/capture-yandex-reviews.mjs --slug port --write-db
//        — одно здание, для первой проверки;
//   node scripts/capture-yandex-reviews.mjs --missing-only --write-db
//        — весь каталог зданий без ЛЮБОГО текстового отзыва с Яндекса
//          (можно прерывать и запускать снова — уже собранные пропускаются).
//
// Флаги: --limit N, --slug SLUG, --missing-only, --skip-collected,
// --max-age-days 45, --output DIR, --profile DIR.
//
// Переменные окружения: SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN
// (для --write-db и --skip-collected/--missing-only), CHROME_PATH,
// CHROME_WINDOW_SIZE / CHROME_WINDOW_POSITION.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, runSql, sqlLiteral } from './nearby-places-common.mjs';

const args = process.argv.slice(2);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);

const onlySlug = valueOf('--slug');
const limit = Number(valueOf('--limit') ?? 0);
const maxAgeDays = Number(valueOf('--max-age-days') ?? 45);
const writeDb = has('--write-db');
const listOnly = has('--list');
const skipCollected = has('--skip-collected');
const missingOnly = has('--missing-only');
const outputRoot = path.resolve(valueOf('--output') ?? 'tmp/yandex-bc-reviews');
// Тот же профиль, что у сбора организаций и инфраструктуры — в нём уже
// лежат куки Яндекса, а значит CAPTCHA спрашивают реже. НЕ запускать
// одновременно со скриптами, использующими тот же путь: Chrome не даёт
// открыть второй процесс на тот же профиль.
const profileDir = path.resolve(valueOf('--profile') ?? 'tmp/yandex-maps-profile');
const windowSize = process.env.CHROME_WINDOW_SIZE ?? '760,900';
const windowPosition = process.env.CHROME_WINDOW_POSITION ?? '760,0';

const chromeCandidates = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  : process.platform === 'win32'
    ? [
        `${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chromePath = process.env.CHROME_PATH ?? chromeCandidates.find((candidate) => candidate && existsSync(candidate));

const anonKey = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!listOnly && !chromePath) {
  console.error('Chrome не найден. Укажите полный путь через переменную CHROME_PATH');
  process.exit(1);
}
if ((writeDb || skipCollected || missingOnly) && !serviceRoleKey && !accessToken) {
  console.error('Нужен SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const CITY_PATH = valueOf('--city-path') ?? '157/minsk';
const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// --- Разбор карточки отзыва (.business-review-view) ------------------------
// СЕЛЕКТОРЫ-БЛИЗНЕЦЫ с extractReviewsFromHtml в
// src/lib/businessCenterSnapshotParser.ts — см. комментарий в шапке файла.
// Выполняется внутри страницы (page.evaluate), поэтому не импортируется
// напрямую — TS-модуль в браузерный контекст Playwright не протащить.
function extractReviewCardsInPage() {
  const cards = [...document.querySelectorAll('.business-review-view')];
  return cards.map((card) => {
    const author = card.querySelector('[itemprop="author"] [itemprop="name"]')?.textContent?.trim() || null;
    const publishedAt = card.querySelector('[itemprop="datePublished"]')?.getAttribute('content') ?? null;
    const body = card.querySelector('.spoiler-view__text-container')?.textContent?.trim() ?? '';
    const ratingEl = card.querySelector('[itemprop="ratingValue"]');
    const ratingRaw = ratingEl ? (ratingEl.getAttribute('content') ?? ratingEl.textContent ?? '').trim().replace(',', '.') : '';
    const rating = ratingRaw && Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;
    const likeButton = card.querySelector('[aria-label="Лайк"]');
    const dislikeButton = card.querySelector('[aria-label="Дизлайк"]');
    const likes = likeButton ? Number(likeButton.querySelector('.business-reactions-view__counter')?.textContent ?? '0') : 0;
    const dislikes = dislikeButton ? Number(dislikeButton.querySelector('.business-reactions-view__counter')?.textContent ?? '0') : 0;
    return { author, publishedAt, body, rating, likes: Number.isFinite(likes) ? likes : 0, dislikes: Number.isFinite(dislikes) ? dislikes : 0 };
  });
}

// Дедуп по автор+дата — тот же ключ, что уникальный индекс таблицы
// (business_center_slug, author, published_at). Без author/publishedAt/body
// строка не пройдёт ограничение NOT NULL/дедуп — пропускаем сразу, как и в
// extractReviewsFromHtml.
function dedupeReviews(rawReviews) {
  const seen = new Set();
  const reviews = [];
  for (const r of rawReviews) {
    const author = normalizeText(r.author);
    const publishedAt = r.publishedAt;
    const body = normalizeText(r.body);
    if (!author || !publishedAt || !body) continue;
    const key = `${author}__${publishedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviews.push({ author, publishedAt, body, rating: r.rating, likes: r.likes, dislikes: r.dislikes });
  }
  return reviews;
}

async function pauseForUser(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`${message}\nНажмите Enter, когда страница готова… `);
  rl.close();
}

async function looksLikeCaptcha(page) {
  if (/showcaptcha|checkcaptcha/.test(page.url())) return true;
  return page
    .locator('form[action*="checkcaptcha"], .CheckboxCaptcha, .AdvancedCaptcha, .captcha-wrapper')
    .first()
    .isVisible()
    .catch(() => false);
}

// Скролл до стабилизации числа карточек — тот же приём (unchanged < 6),
// что уже проверен на 130+ карточках в capture-yandex-bc-tenants.mjs для
// списка организаций.
async function collectReviewsFromOpenTab(page) {
  let unchanged = 0;
  let previous = 0;
  let latest = [];
  while (unchanged < 6) {
    latest = dedupeReviews(await page.evaluate(extractReviewCardsInPage));
    unchanged = latest.length === previous ? unchanged + 1 : 0;
    previous = latest.length;
    const scrolled = await page
      .locator('.scroll__container')
      .last()
      .evaluate((el) => {
        const before = el.scrollTop;
        el.scrollTop = el.scrollHeight;
        return el.scrollTop !== before;
      })
      .catch(() => false);
    if (!scrolled && unchanged >= 2) break; // прокрутка упёрлась в конец раньше, чем счётчик — список короче окна
    await page.waitForTimeout(1200);
  }
  return latest;
}

async function saveCheckpoint(slug, reviews, sourceUrl, capturedAt) {
  const dir = path.join(outputRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'latest.json');
  await fs.writeFile(`${target}.tmp`, JSON.stringify({ slug, sourceUrl, capturedAt, reviews }, null, 2));
  await fs.rename(`${target}.tmp`, target);
}

// --- Запись в базу -----------------------------------------------------
// Одна строка на отзыв (не JSONB-снимок, как у организаций) — уникальный
// индекс (business_center_slug, author, published_at) в самой таблице.
async function writeReviews({ supabase, slug, reviews, capturedAt }) {
  const rows = reviews.map((r) => ({
    business_center_slug: slug,
    source: 'yandex_maps',
    author: r.author,
    rating: r.rating,
    body: r.body,
    likes: r.likes,
    dislikes: r.dislikes,
    published_at: r.publishedAt,
    captured_at: capturedAt,
  }));
  if (rows.length === 0) return;
  if (supabase) {
    const { error } = await supabase
      .from('business_center_review_snapshots')
      .upsert(rows, { onConflict: 'business_center_slug,author,published_at' });
    if (error) throw error;
    return;
  }
  const values = rows
    .map(
      (r) => `(
      ${sqlLiteral(r.business_center_slug)}, ${sqlLiteral(r.source)}, ${sqlLiteral(r.author)},
      ${r.rating ?? 'null'}, ${sqlLiteral(r.body)}, ${r.likes}, ${r.dislikes},
      ${sqlLiteral(r.published_at)}::timestamptz, ${sqlLiteral(r.captured_at)}::timestamptz
    )`,
    )
    .join(',');
  await runSql(
    `insert into public.business_center_review_snapshots
       (business_center_slug, source, author, rating, body, likes, dislikes, published_at, captured_at)
       values ${values}
     on conflict (business_center_slug, author, published_at) do update set
       rating = excluded.rating, body = excluded.body, likes = excluded.likes,
       dislikes = excluded.dislikes, captured_at = excluded.captured_at;`,
    accessToken,
  );
}

async function slugsWithYandexReviews() {
  if (serviceRoleKey) {
    const client = createClient(SUPABASE_URL, serviceRoleKey);
    const { data, error } = await client
      .from('business_center_review_snapshots')
      .select('business_center_slug')
      .eq('source', 'yandex_maps')
      .range(0, 9999);
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.business_center_slug));
  }
  const rows = await runSql(
    "select distinct business_center_slug from public.business_center_review_snapshots where source = 'yandex_maps';",
    accessToken,
  );
  return new Set(rows.map((row) => row.business_center_slug));
}

async function latestCapturedAt() {
  if (serviceRoleKey) {
    const client = createClient(SUPABASE_URL, serviceRoleKey);
    const { data, error } = await client
      .from('business_center_review_snapshots')
      .select('business_center_slug,captured_at')
      .eq('source', 'yandex_maps')
      .range(0, 9999);
    if (error) throw error;
    const latest = new Map();
    for (const row of data ?? []) {
      const current = latest.get(row.business_center_slug);
      if (!current || new Date(row.captured_at) > new Date(current)) latest.set(row.business_center_slug, row.captured_at);
    }
    return latest;
  }
  const rows = await runSql(
    `select business_center_slug, max(captured_at) as captured_at
       from public.business_center_review_snapshots where source = 'yandex_maps'
       group by business_center_slug;`,
    accessToken,
  );
  return new Map(rows.map((row) => [row.business_center_slug, row.captured_at]));
}

async function catalogEntries() {
  const client = createClient(SUPABASE_URL, anonKey);
  let query = client
    .from('business_centers')
    .select('slug,name,address,status,sort_order')
    .eq('status', 'built')
    .order('sort_order', { ascending: true });
  if (onlySlug) query = query.eq('slug', onlySlug);
  const { data, error } = await query;
  if (error) throw error;
  let centers = data ?? [];

  if (missingOnly) {
    const withReviews = await slugsWithYandexReviews();
    centers = centers.filter((c) => !withReviews.has(c.slug));
  } else if (skipCollected) {
    const latest = await latestCapturedAt();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    centers = centers.filter((c) => {
      const capturedAt = latest.get(c.slug);
      return !capturedAt || Date.now() - new Date(capturedAt).getTime() > maxAgeMs;
    });
  }
  if (limit > 0) centers = centers.slice(0, limit);
  return centers;
}

async function main() {
  const queue = await catalogEntries();
  if (listOnly) {
    console.log(JSON.stringify(queue.map(({ slug, name, address }) => ({ slug, name, address })), null, 2));
    return;
  }
  if (queue.length === 0) {
    console.log('Нечего собирать: все выбранные БЦ уже с отзывами (или список пуст)');
    return;
  }

  const supabase = serviceRoleKey ? createClient(SUPABASE_URL, serviceRoleKey) : null;

  console.log(`БЦ в очереди: ${queue.length}. Открываю Chrome — окно можно двигать, но не закрывайте его.`);
  const { chromium } = await import('playwright-core');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: chromePath,
    viewport: null,
    args: [`--window-size=${windowSize}`, `--window-position=${windowPosition}`],
  });
  const page = context.pages()[0] ?? (await context.newPage());

  let done = 0;
  let totalReviews = 0;
  try {
    for (const center of queue) {
      const capturedAt = new Date().toISOString();
      const searchUrl = `https://yandex.by/maps/${CITY_PATH}/search/${encodeURIComponent(center.name)}/`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      if (await looksLikeCaptcha(page)) {
        await pauseForUser('Яндекс показал проверку. Пройдите её в окне Chrome.');
      }
      await pauseForUser(
        `\n[${done + 1}/${queue.length}] ${center.name ?? center.slug} — ${center.address ?? ''}\n` +
          'Откройте карточку ЭТОГО здания и вкладку «Отзывы» (если организации с таким названием на Яндекс.Картах нет — просто нажмите Enter, здание останется без отзывов).',
      );

      const reviews = await collectReviewsFromOpenTab(page);
      await saveCheckpoint(center.slug, reviews, page.url(), capturedAt);
      if (writeDb) await writeReviews({ supabase, slug: center.slug, reviews, capturedAt });
      done += 1;
      totalReviews += reviews.length;
      console.log(`${done}/${queue.length} ${center.slug}: ${reviews.length} отзывов${writeDb ? ', записано в базу' : ''}`);
    }
  } finally {
    await context.close();
  }

  console.log(`Готово: ${done} БЦ, ${totalReviews} отзывов${writeDb ? '' : ' (в базу НЕ писали — добавьте --write-db)'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
