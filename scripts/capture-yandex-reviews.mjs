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
// известен (в базе не хранится). В ручном режиме (по умолчанию для БЦ) скрипт
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
//          (можно прерывать и запускать снова — уже собранные пропускаются);
//   node scripts/capture-yandex-reviews.mjs --missing-only --classes A,B,B+ --write-db
//        — весь остаток классов A/Б/Б+ за один прогон (владелец, 2026-09-22:
//          класс C и ниже — отдельно, не сейчас); --limit N — если нужно
//          пачками, а не всё сразу.
//
// На каждом здании — либо Enter (страница готова, собирай), либо "s"/"skip"
// + Enter, если у БЦ нет своей организации на Яндекс.Картах вообще или на
// ней нет отзывов — здание просто останется без отзывов, без попытки
// скроллить случайную страницу.
//
// АВТОМАТИЧЕСКИЙ РЕЖИМ (--auto; для --kind tc включён по умолчанию,
// владелец, 2026-09-23: «одна команда, без Enter на каждом здании»). Карточку
// организации здания скрипт находит сам — scripts/yandex-org-resolve.mjs
// (поиск по названию у координат здания, проверка рубрики, имени и
// расстояния), открывает её вкладку «Отзывы» прямым адресом
// /maps/org/<id>/reviews/ и собирает. Человек нужен только при CAPTCHA.
// Не нашлась карточка или вкладка открылась не та — здание ничего не пишет
// (ни в базу, ни в latest.json) и попадает в список «не собраны» в конце
// прогона. Ноль отзывов сохраняется только если открыта вкладка «Отзывы»
// именно найденной организации и Яндекс сам показывает, что отзывов нет.
//   node scripts/capture-yandex-reviews.mjs --kind tc --missing-only --write-db
// --manual возвращает ручной режим и для ТЦ.
//
// Флаги: --kind bc|tc|all, --limit N, --slug SLUG[,SLUG2…], --missing-only, --classes A,B,B+,
// --skip-collected, --max-age-days 45, --output DIR, --profile DIR,
// --auto | --manual, --max-reviews N (стоп после N отзывов на здание; по
// умолчанию 500 для ТЦ в автоматическом режиме, иначе без ограничения; 0 —
// без ограничения), --max-distance 400, --headless (без окна —
// для проверки на сервере).
//
// Переменные окружения: SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN
// (для --write-db и --skip-collected/--missing-only), CHROME_PATH,
// CHROME_WINDOW_SIZE / CHROME_WINDOW_POSITION.

import './local-supabase-env.mjs'; // первым: ключ из ~/.config/redevelopment/supabase.env
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, runSql, slugsWithYandexReviews, sqlLiteral } from './nearby-places-common.mjs';
import {
  DEFAULT_MAX_DISTANCE_M,
  isOrgTabUrl,
  launchOptions,
  orgUrl,
  resolveBuildingOrganization,
} from './yandex-org-resolve.mjs';

const args = process.argv.slice(2);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);

const onlySlug = valueOf('--slug');
// --slug принимает и список через запятую: пробный прогон по нескольким зданиям.
const onlySlugs = (onlySlug ?? '').split(',').map((s) => s.trim()).filter(Boolean);
// --kind bc|tc|all — какой каталог собирать (по умолчанию bc, как было до
// каталога ТЦ 2026-09-23; торговые центры — `--kind tc`).
const catalogKind = valueOf('--kind') ?? 'bc';
const limit = Number(valueOf('--limit') ?? 0);
const maxAgeDays = Number(valueOf('--max-age-days') ?? 45);
const writeDb = has('--write-db');
const listOnly = has('--list');
const skipCollected = has('--skip-collected');
const missingOnly = has('--missing-only');
// Владелец, 2026-09-22: сначала добить класс A/B/B+, класс C — потом (у него
// меньше трафика и цены сделки, отзывы там не так критичны). business_class
// в базе — латиница ('A','B','B+','C'), сравнение регистронезависимое.
const classesFilter = (valueOf('--classes') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
// Автоматический режим — см. шапку файла. Для ТЦ по умолчанию, для БЦ
// поведение прежнее, пока не передан --auto.
const autoMode = has('--auto') || (catalogKind === 'tc' && !has('--manual'));
const headless = has('--headless');
// Потолок отзывов на здание. У крупных ТЦ их тысячи (Galleria Minsk —
// 10 364, ЦУМ — 5 338 на 2026-09-23): прокрутка до конца — десятки минут на
// одно здание и тысячи карточек в DOM. Для ТЦ в автоматическом режиме по
// умолчанию 500 первых в порядке Яндекса; --max-reviews 0 — без
// ограничения. Для БЦ ограничения по-прежнему нет.
const maxReviews = valueOf('--max-reviews') != null
  ? Number(valueOf('--max-reviews'))
  : autoMode && catalogKind === 'tc' ? 500 : 0;
const maxDistance = Number(valueOf('--max-distance') ?? DEFAULT_MAX_DISTANCE_M);
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
// service-role клиент для чтения/записи в обход RLS — один на весь скрипт,
// используется и в catalogEntries() (фильтр --missing-only), и в записи
// отзывов в main().
const supabase = serviceRoleKey ? createClient(SUPABASE_URL, serviceRoleKey) : null;

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
  const answer = await rl.question(`${message}\nНажмите Enter, когда страница готова, или наберите "s" и Enter, чтобы пропустить это здание… `);
  rl.close();
  return answer.trim().toLowerCase();
}

// Явная команда пропуска — набрать "s" (или "skip") и Enter, если у здания
// нет организации на Яндекс.Картах вообще или на ней нет отзывов. Просто
// Enter (пустой ответ) — обычное "страница готова, собирай".
const SKIP_ANSWERS = new Set(['s', 'skip', 'п', 'пропустить']);
function isSkip(answer) {
  return SKIP_ANSWERS.has(answer);
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
    if (maxReviews > 0 && latest.length >= maxReviews) return latest.slice(0, maxReviews);
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

async function latestCapturedAt() {
  if (supabase) {
    // PostgREST отдаёт максимум 1000 строк за запрос — .range(0, N) с
    // большим N этот потолок не обходит, нужна постраничная выборка (см.
    // тот же комментарий у selectAllPages в nearby-places-common.mjs).
    const pageSize = 1000;
    const latest = new Map();
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('business_center_review_snapshots')
        .select('business_center_slug,captured_at')
        .eq('source', 'yandex_maps')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      for (const row of data ?? []) {
        const current = latest.get(row.business_center_slug);
        if (!current || new Date(row.captured_at) > new Date(current)) latest.set(row.business_center_slug, row.captured_at);
      }
      if (!data || data.length < pageSize) break;
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
    .select('slug,name,address,status,sort_order,business_class,lat,lng')
    .eq('status', 'built')
    .order('sort_order', { ascending: true });
  if (catalogKind !== 'all') query = query.eq('kind', catalogKind);
  if (onlySlugs.length > 0) query = query.in('slug', onlySlugs);
  if (classesFilter.length > 0) query = query.in('business_class', classesFilter);
  const { data, error } = await query;
  if (error) throw error;
  let centers = data ?? [];

  if (missingOnly) {
    const withReviews = await slugsWithYandexReviews({ supabase, accessToken });
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

  console.log(`БЦ в очереди: ${queue.length}. Открываю Chrome — окно можно двигать, но не закрывайте его.`);
  const { chromium } = await import('playwright-core');
  const context = await chromium.launchPersistentContext(
    profileDir,
    launchOptions({ headless, chromePath, windowSize, windowPosition }),
  );
  const page = context.pages()[0] ?? (await context.newPage());

  if (autoMode) {
    try {
      await runAuto(page, queue);
    } finally {
      await context.close();
    }
    return;
  }

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
      const answer = await pauseForUser(
        `\n[${done + 1}/${queue.length}] ${center.name ?? center.slug} — ${center.address ?? ''}\n` +
          'Откройте карточку ЭТОГО здания и вкладку «Отзывы».',
      );

      let reviews = [];
      if (isSkip(answer)) {
        console.log(`  пропущено: организации нет или отзывов нет`);
      } else {
        reviews = await collectReviewsFromOpenTab(page);
      }
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

// --- Автоматический режим -------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 1–3 секунды случайно между запросами: одинаковый ритм — примета робота.
const randomDelay = () => sleep(1000 + Math.floor(Math.random() * 2000));

async function passCaptchaIfAny(page) {
  if (!(await looksLikeCaptcha(page))) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('Яндекс показал проверку. Пройдите её в окне Chrome и нажмите Enter… ');
  rl.close();
  return true;
}

// Поиск идёт fetch'ем ИЗНУТРИ вкладки (тот же домен и куки, без перехода) —
// как у scripts/capture-yandex-nearby.mjs. Для этого вкладка должна стоять
// на yandex.by.
async function ensureOnYandex(page) {
  if (page.url().startsWith('https://yandex.by/')) return;
  await page.goto(`https://yandex.by/maps/${CITY_PATH}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  await passCaptchaIfAny(page);
}

async function resolveWithPage(page, center) {
  await ensureOnYandex(page);
  return resolveBuildingOrganization({
    building: center,
    maxDistance,
    fetchHtml: (url) => page.evaluate(
      (target) => fetch(target, { credentials: 'include' }).then((response) => response.text()),
      url,
    ),
    onCaptcha: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      await passCaptchaIfAny(page);
    },
    delay: randomDelay,
    log: (line) => console.log(line),
  });
}

// Что показывает вкладка «Отзывы»: та ли организация (по адресу страницы) и
// сколько отзывов пишет сам Яндекс в заголовке вкладки («Отзывы 5338»).
async function reviewsTabState(page, orgId) {
  const urlOk = isOrgTabUrl(page.url(), orgId, 'reviews');
  const tab = await page.evaluate(() => {
    const el = document.querySelector('.tabs-select-view__title._name_reviews');
    if (!el) return { tabPresent: false, tabCount: null };
    const digits = (el.textContent ?? '').replace(/\D+/g, '');
    return { tabPresent: true, tabCount: digits ? Number(digits) : 0 };
  }).catch(() => ({ tabPresent: false, tabCount: null }));
  return { urlOk, ...tab };
}

async function openReviewsTab(page, org) {
  const url = orgUrl(org, 'reviews');
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    if (await passCaptchaIfAny(page)) continue; // после проверки — открыть заново
    await page.waitForSelector('.business-review-view', { timeout: 15_000 }).catch(() => {});
    return url;
  }
  return url;
}

// Запасной путь, когда прокрутка упёрлась раньше, чем кончились отзывы (так
// бывает, если подгрузка следующей порции не прошла — проверено 2026-09-23
// в окружении, где часть доменов Яндекса закрыта): вкладка «Отзывы» отдаёт
// по 50 отзывов на странице ?page=N прямо в HTML. Идём по страницам, пока
// они приносят новые отзывы. Если прокрутка уже собрала всё, первая же
// страница ничего нового не даст — и цикл сразу закончится.
async function collectReviewsByPages(page, org, collected) {
  const byKey = new Map(collected.map((r) => [`${r.author}__${r.publishedAt}`, r]));
  for (let n = 2; n <= 500; n += 1) {
    if (maxReviews > 0 && byKey.size >= maxReviews) break;
    await page.goto(`${orgUrl(org, 'reviews')}?page=${n}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    if (await passCaptchaIfAny(page)) {
      n -= 1; // та же страница ещё раз, уже после проверки
      continue;
    }
    await page.waitForSelector('.business-review-view', { timeout: 10_000 }).catch(() => {});
    if (!isOrgTabUrl(page.url(), org.id, 'reviews')) break;
    let added = 0;
    for (const review of dedupeReviews(await page.evaluate(extractReviewCardsInPage))) {
      const key = `${review.author}__${review.publishedAt}`;
      if (byKey.has(key)) continue;
      byKey.set(key, review);
      added += 1;
    }
    if (added === 0) break;
    await randomDelay();
  }
  const all = [...byKey.values()];
  return maxReviews > 0 ? all.slice(0, maxReviews) : all;
}

async function runAuto(page, queue) {
  let done = 0;
  let totalReviews = 0;
  const unresolved = [];
  const failed = [];
  // Одна карточка на два здания каталога («Европа» и «Новая Европа» по
  // соседним адресам) — неоднозначность: второму зданию её не отдаём.
  const orgOwners = new Map();
  for (const [index, center] of queue.entries()) {
    console.log(`\n[${index + 1}/${queue.length}] ${center.name ?? center.slug} — ${center.address ?? ''}`);
    const org = await resolveWithPage(page, center);
    if (!org) {
      console.log(`  ${center.slug}: карточка организации не найдена — пропускаю, ничего не пишу`);
      unresolved.push(center.slug);
      await randomDelay();
      continue;
    }
    if (orgOwners.has(org.id)) {
      console.log(`  ${center.slug}: карточка ${org.name} (${org.id}) уже досталась ${orgOwners.get(org.id)} — пропускаю, проверьте вручную`);
      unresolved.push(center.slug);
      continue;
    }
    orgOwners.set(org.id, center.slug);
    console.log(`  карточка: ${org.name} (${org.rubric}), id ${org.id}, ${org.distance} м, запрос «${org.query}»`);
    const capturedAt = new Date().toISOString();
    await openReviewsTab(page, org);
    const state = await reviewsTabState(page, org.id);
    let reviews = state.urlOk ? await collectReviewsFromOpenTab(page) : [];
    if (
      reviews.length > 0 &&
      (state.tabCount ?? 0) > reviews.length &&
      (maxReviews === 0 || reviews.length < maxReviews)
    ) {
      const before = reviews.length;
      reviews = await collectReviewsByPages(page, org, reviews);
      if (reviews.length > before) console.log(`  прокрутка дала ${before}, по страницам — ${reviews.length}`);
    }
    if (reviews.length === 0) {
      // Ноль — только если это точно вкладка «Отзывы» найденной организации
      // и Яндекс сам не показывает ни одного отзыва. Иначе это сбой перехода,
      // а не пустая карточка: ничего не пишем.
      const confirmedEmpty = state.urlOk && state.tabPresent && state.tabCount === 0;
      if (!confirmedEmpty) {
        console.log(
          `  ${center.slug}: отзывы не собрались (адрес ${state.urlOk ? 'верный' : `не тот: ${page.url()}`}, ` +
            `на вкладке ${state.tabCount ?? '—'}) — ничего не пишу`,
        );
        failed.push(center.slug);
        await randomDelay();
        continue;
      }
      console.log(`  ${center.slug}: у организации нет отзывов (так показывает Яндекс)`);
    }
    await saveCheckpoint(center.slug, reviews, page.url(), capturedAt);
    if (writeDb) await writeReviews({ supabase, slug: center.slug, reviews, capturedAt });
    done += 1;
    totalReviews += reviews.length;
    console.log(
      `${done}/${queue.length} ${center.slug}: ${reviews.length} отзывов` +
        `${state.tabCount ? ` (на вкладке ${state.tabCount})` : ''}${writeDb ? ', записано в базу' : ''}`,
    );
    await randomDelay();
  }
  console.log(`\nГотово: ${done} зданий, ${totalReviews} отзывов${writeDb ? '' : ' (в базу НЕ писали — добавьте --write-db)'}`);
  if (unresolved.length > 0) {
    console.log(`Карточка организации не найдена (${unresolved.length}): ${unresolved.join(',')}`);
  }
  if (failed.length > 0) {
    console.log(`Карточка найдена, но отзывы не собрались (${failed.length}): ${failed.join(',')}`);
  }
  if (unresolved.length + failed.length > 0) {
    console.log('Их можно добрать вручную: --manual --slug <список через запятую>');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
