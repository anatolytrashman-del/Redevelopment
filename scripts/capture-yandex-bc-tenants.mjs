#!/usr/bin/env node
// Локальный полуавтоматический сбор организаций из открытой страницы Яндекс Карт.
// Не обходит CAPTCHA: при проверке пользователь завершает её в открытом Chrome и нажимает Enter.
//
// АВТОМАТИЧЕСКИЙ РЕЖИМ (--auto; для --kind tc включён по умолчанию,
// владелец, 2026-09-23: одна команда на весь каталог ТЦ, без Enter на каждом
// здании). Сначала — собственная карточка организации здания (ТЦ, рынка,
// универмага): её находит scripts/yandex-org-resolve.mjs, и список берётся
// с её вкладки «Внутри» (/maps/org/<id>/inside/ — плитки .place-inside-view,
// а не сниппеты .search-business-snippet-view, как на странице дома). Затем
// страница дома по адресу (или по yandex_url из business_center_yandex_buildings),
// вкладку «Организации внутри» скрипт открывает сам; списки объединяются
// (на доме бывает вдвое больше — см. collectAuto). Нет своей карточки —
// только дом. Человек нужен только при CAPTCHA.
// Ничего не собралось — здание не пишет ничего (ни в базу, ни в latest.json:
// ноль не затирает прежний список) и попадает в список в конце прогона.
//   node scripts/capture-yandex-bc-tenants.mjs --kind tc --skip-collected --write-db
// --manual возвращает ручной режим и для ТЦ; --headless — без окна (для
// проверки на сервере); --max-distance 400 — порог сверки карточки.
//
// ЭТАЖИ (2026-09-24). Каждой организации проставляется floor: из текста её
// плитки, а если там пусто — из её собственной карточки (уровень поэтажного
// плана, см. scripts/yandex-tenant-floors.mjs). Это добавочный запрос на
// организацию без подписи, поэтому здание собирается дольше; --no-floors
// отключает шаг. Дозаполнить этажи у уже собранных зданий, не собирая
// список заново:
//   node scripts/capture-yandex-bc-tenants.mjs --kind tc --floors-only --write-db
// (--node-fetch — без Chrome, обычными запросами; на CAPTCHA такой прогон
// останавливается и сохраняет найденное).
//
// ТОЧКИ МАГАЗИНОВ (--coords, 2026-09-24): вместе с этажом из карточки
// организации берётся её точка на карте — для схемы этажа на странице ТЦ
// (FloorSchema). Карточку открываем у каждой организации без точки, поэтому
// здание идёт дольше. Дозаполнить у уже собранных:
//   node scripts/capture-yandex-bc-tenants.mjs --kind tc --floors-only --coords --slug evropa-tc --write-db

import './local-supabase-env.mjs'; // первым: ключ из ~/.config/redevelopment/supabase.env
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { haversineMeters } from './nearby-places-common.mjs';
import {
  DEFAULT_MAX_DISTANCE_M,
  isOrgTabUrl,
  launchOptions,
  orgUrl,
  resolveBuildingOrganization,
} from './yandex-org-resolve.mjs';
import { fillTenantFloors, floorFromText } from './yandex-tenant-floors.mjs';

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);
const inputPath = valueOf('--input');
const archivePath = valueOf('--webarchive');
const onlySlug = valueOf('--slug');
// --slug принимает и список через запятую: пробный прогон по нескольким зданиям.
const onlySlugs = (onlySlug ?? '').split(',').map((s) => s.trim()).filter(Boolean);
// --kind bc|tc|all — какой каталог собирать (по умолчанию bc, как было до
// каталога ТЦ 2026-09-23; торговые центры — `--kind tc`).
const catalogKind = valueOf('--kind') ?? 'bc';
const limit = Number(valueOf('--limit') ?? 0);
const writeDb = has('--write-db');
const listOnly = has('--list');
const skipCollected = has('--skip-collected');
const withFloors = !has('--no-floors');
const floorsOnly = has('--floors-only');
const withCoords = has('--coords');
const nodeFetch = has('--node-fetch');
// Автоматический режим — см. шапку файла. Для ТЦ по умолчанию; для БЦ
// поведение прежнее, пока не передан --auto.
const autoMode = has('--auto') || (catalogKind === 'tc' && !has('--manual'));
const headless = has('--headless');
const maxDistance = Number(valueOf('--max-distance') ?? DEFAULT_MAX_DISTANCE_M);
const outputRoot = path.resolve(valueOf('--output') ?? 'tmp/yandex-bc-tenants');
const profileDir = path.resolve(valueOf('--profile') ?? 'tmp/yandex-maps-profile');
// Половина экрана, а не --start-maximized — чтобы окно Chrome не закрывало
// собой терминал, где нужно нажимать Enter. Подобрано под типичный ноутбучный
// экран (~1512–1728 логических px в ширину); если не подходит под ваш
// монитор — переопределить через CHROME_WINDOW_SIZE="ШxВ" и
// CHROME_WINDOW_POSITION="X,Y" (например CHROME_WINDOW_SIZE=960,1080
// CHROME_WINDOW_POSITION=960,0 для широкого монитора).
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
const supabaseUrl = process.env.SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = 'iohcdylttyuhwovztrbk';

if (archivePath && !onlySlug) {
  console.error('Для импорта архива укажите --slug');
  process.exit(1);
}
if (!archivePath && !chromePath && !(floorsOnly && nodeFetch)) {
  console.error('Chrome не найден. Укажите полный путь через переменную CHROME_PATH');
  process.exit(1);
}
if (archivePath && process.platform !== 'darwin') {
  console.error('Импорт Apple .webarchive поддерживается только на macOS; живой сбор работает на macOS, Windows и Linux');
  process.exit(1);
}
if (writeDb && !serviceRoleKey && !accessToken) {
  console.error('Для --write-db нужен SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}
if (floorsOnly && !serviceRoleKey && !accessToken) {
  console.error('Для --floors-only нужен SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN (прежний список берётся из таблицы снимков)');
  process.exit(1);
}
if (skipCollected && !serviceRoleKey && !accessToken) {
  console.error('Для --skip-collected нужен SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN (anon-ключу таблица снимков закрыта)');
  process.exit(1);
}

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const DEFAULT_ORGANIZATION_CATEGORY = 'Офис организации';
// Яндекс включает сам объект БЦ в список «Организации внутри» (например,
// «Порт» с категорией «Бизнес-центр подъезд 1»). Это карточка здания, а не
// арендатор. Удаляем её до записи чекпоинта и БД, чтобы следующий сбор не
// возвращал такие записи. Кириллическую границу проверяем Unicode-lookahead,
// потому что \b в JavaScript работает только с ASCII.
// У торгового центра карточка самого здания — «Торговый центр» или
// «Торгово-развлекательный центр»; в БЦ такая организация внутри — это
// арендатор, поэтому второе правило включается только при --kind tc.
const BUSINESS_CENTER_CATEGORY_RE = catalogKind === 'tc'
  ? /^(?:бизнес[\s-]*центр|торгов(?:ый|о-развлекательный)[\s-]*центр)(?![\p{L}])/iu
  : /^бизнес[\s-]*центр(?![\p{L}])/iu;
const withDefaultCategory = (organizations) => organizations
  .map((organization) => ({
    ...organization,
    category: normalizeText(organization.category) || DEFAULT_ORGANIZATION_CATEGORY,
  }))
  .filter((organization) => !BUSINESS_CENTER_CATEGORY_RE.test(organization.category));
const decodeHtml = (value) => value
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

function extractFromHtml(html, sourceUrl) {
  const organizations = new Map();
  const titlePattern = /class="search-business-snippet-view__title"[^>]*>(.*?)<\//gs;
  for (const match of html.matchAll(titlePattern)) {
    const name = normalizeText(decodeHtml(match[1].replace(/<[^>]+>/g, '')));
    const before = html.slice(Math.max(0, match.index - 12000), match.index);
    const links = [...before.matchAll(/href="([^"]*\/org\/[^/]+\/(\d+)\/?)"/g)];
    const link = links.at(-1);
    if (!name || !link) continue;
    const id = link[2];
    const url = new URL(decodeHtml(link[1]), sourceUrl).href;
    organizations.set(id, { name, sourceId: id, sourceUrl: url, category: DEFAULT_ORGANIZATION_CATEGORY });
  }
  return [...organizations.values()];
}

async function webarchiveHtml(file) {
  const script = 'ObjC.import("Foundation"); const p=$.NSPropertyListSerialization.propertyListWithDataOptionsFormatError($.NSData.dataWithContentsOfFile($.NSString.stringWithUTF8String(ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey("ARCHIVE")))),$.NSPropertyListImmutable,null,null); const d=p.objectForKey("WebMainResource").objectForKey("WebResourceData"); $.NSFileHandle.fileHandleWithStandardOutput.writeData(d);';
  const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
    env: { ...process.env, ARCHIVE: path.resolve(file) }, maxBuffer: 50 * 1024 * 1024, encoding: 'buffer',
  });
  return stdout.toString('utf8');
}

function xmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function saveWebarchive(file, html, url) {
  if (process.platform !== 'darwin') return false;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>WebMainResource</key><dict><key>WebResourceData</key><data>${Buffer.from(html).toString('base64')}</data><key>WebResourceFrameName</key><string></string><key>WebResourceMIMEType</key><string>text/html</string><key>WebResourceTextEncodingName</key><string>UTF-8</string><key>WebResourceURL</key><string>${xmlEscape(url)}</string></dict></dict></plist>`;
  await fs.writeFile(file, xml);
  await execFileAsync('plutil', ['-convert', 'binary1', file]);
  return true;
}

// Категория/этаж выделены по реальным примерам card.innerText (тестовая
// партия из 10 БЦ, 2026-09-18) — не угадывались вслепую. Карточка идёт как
// "Фото [N] Название Рейтинг X,Y N оценок N оценок <статус работы>
// <Категория> [офис N[, этаж M] | этаж M] [Вход ...] [В подборке ...]
// [Акция]" — категория лежит строго между статусом работы и первым из
// стоп-слов (офис/этаж/Вход/В подборке/Акция).
const STATUS_RE = /(Открыто(?: до \S+)?|Закрыто(?: до \S+)?|До закрытия \d+ мин|До открытия \d+ мин|Круглосуточно|График работы не указан|Организация переехала|Больше не работает)/;
const CATEGORY_STOP_RE = /\s+(?:офис\s|этаж\s|Вход\s|В подборке|Акция)/;

function parseCardText(rawText) {
  const text = normalizeText(rawText);
  const ratingMatch = text.match(/(?:^|\s)([1-5][.,]\d)(?=\s|$)/);
  const rating = ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null;
  const reviewMatch = text.match(/(\d+)\s*(?:оцен\w*|отзыв\w*)/i);
  const reviewCount = reviewMatch ? Number(reviewMatch[1]) : null;
  const statusMatch = text.match(STATUS_RE);
  let category = null;
  if (statusMatch) {
    const after = text.slice(statusMatch.index + statusMatch[0].length).trim();
    const stopMatch = after.match(CATEGORY_STOP_RE);
    category = (stopMatch ? after.slice(0, stopMatch.index) : after).trim() || null;
  }
  return { rating, reviewCount, category: category || DEFAULT_ORGANIZATION_CATEGORY, rawText: text || null, floor: floorFromText(text) };
}

async function pauseForUser(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`${message}\nНажмите Enter, когда страница готова… `);
  rl.close();
}

// Карточки организаций на открытой странице. Два вида вёрстки: сниппеты
// списка «Организации внутри» на странице ДОМА (.search-business-snippet-view)
// и плитки вкладки «Внутри» на карточке ОРГАНИЗАЦИИ (.place-inside-view:
// название, подпись-рубрика, рейтинг, этаж — проверено на ЦУМ и «Столице»,
// 2026-09-23). Один page.evaluate() на все карточки разом.
function extractOrganizationCardsInPage() {
  const snippets = [...document.querySelectorAll('.search-business-snippet-view')].map((card) => {
    const titleEl = card.querySelector('.search-business-snippet-view__title');
    const linkEl = card.querySelector('a[href*="/org/"]');
    return { kind: 'snippet', title: titleEl?.textContent ?? '', href: linkEl?.getAttribute('href') ?? null, text: card.innerText ?? '' };
  });
  const tiles = [...document.querySelectorAll('.place-inside-view')].map((tile) => {
    const linkEl = tile.querySelector('a[href*="/org/"]');
    return {
      kind: 'tile',
      title: tile.querySelector('.related-item-photo-view__title')?.textContent ?? '',
      href: linkEl?.getAttribute('href') ?? null,
      category: tile.querySelector('.related-item-photo-view__description')?.textContent ?? '',
      rating: tile.querySelector('.business-rating-badge-view__rating-text')?.textContent ?? '',
      text: tile.innerText ?? '',
    };
  });
  return [...snippets, ...tiles];
}

function organizationFromCard(card, pageUrl, entry, buildingUrl) {
  const title = normalizeText(card.title);
  const id = card.href?.match(/\/org\/(?:[^/]+\/)?(\d+)/)?.[1];
  if (!title || !id) return null;
  const base = { name: title, sourceId: id, sourceUrl: new URL(card.href, pageUrl).href, buildingAddress: entry.address, buildingUrl };
  if (card.kind === 'snippet') return { ...base, ...parseCardText(card.text) };
  const ratingValue = Number(normalizeText(card.rating).replace(',', '.'));
  return {
    ...base,
    rating: normalizeText(card.rating) && Number.isFinite(ratingValue) ? ratingValue : null,
    reviewCount: null,
    category: normalizeText(card.category) || DEFAULT_ORGANIZATION_CATEGORY,
    rawText: normalizeText(card.text) || null,
    floor: floorFromText(card.text),
  };
}

// Скролл до стабилизации числа карточек (unchanged < 4).
async function scrollAndCollect(page, entry, buildingUrl, initialOrganizations, onProgress) {
  const found = new Map(initialOrganizations.map((organization) => [organization.sourceId, organization]));
  let unchanged = 0;
  let previous = 0;
  // 4 пустых прокрутки подряд по 1 с — список кончился (было 6 по 1,2 с:
  // лишние ~5 с на каждый список, а их у здания два — «Внутри» и дом).
  while (unchanged < 4) {
    // Раньше карточки читались по одной через Playwright-локаторы (два
    // круговых обращения к браузеру на каждую, включая уже известные) —
    // на большом здании (90+ организаций) это заметно накапливалось на
    // каждой итерации скролла. Один page.evaluate() читает все карточки
    // разом внутри браузера — тот же результат, без повторных round-trip.
    const extracted = await page.evaluate(extractOrganizationCardsInPage);
    for (const card of extracted) {
      const organization = organizationFromCard(card, page.url(), entry, buildingUrl);
      if (organization) found.set(organization.sourceId, organization);
    }
    unchanged = found.size === previous ? unchanged + 1 : 0;
    if (found.size > previous && onProgress) await onProgress([...found.values()], page.url());
    previous = found.size;
    await page.locator('.scroll__container').last().evaluate((el) => { el.scrollTop = el.scrollHeight; }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  return [...found.values()];
}

async function collectLive(entry, initialOrganizations, onProgress) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false, executablePath: chromePath, viewport: null,
    args: [`--window-size=${windowSize}`, `--window-position=${windowPosition}`],
  });
  const page = context.pages()[0] ?? await context.newPage();
  const url = entry.yandexUrl ?? `https://yandex.by/maps/157/minsk/search/${encodeURIComponent(entry.address)}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await pauseForUser(`Проверьте адрес «${entry.address}». Если Яндекс показал CAPTCHA, пройдите её. Откройте вкладку «Организации внутри».`);

  const organizations = await scrollAndCollect(page, entry, url, initialOrganizations, onProgress);
  const html = await page.content();
  const finalUrl = page.url();
  await context.close();
  return { html, finalUrl, organizations };
}

// --- Автоматический режим -------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 1–3 секунды случайно: одинаковый ритм запросов — примета робота.
const randomDelay = () => sleep(1000 + Math.floor(Math.random() * 2000));
// Карточки организаций для этажей: 3 потока с паузой 0,5–1,2 с в каждом
// вместо одного с 1–3 с — примерно в пять раз быстрее. --floors-concurrency 1
// возвращает прежний темп, если Яндекс начнёт чаще спрашивать проверку.
const floorsConcurrency = Math.max(1, Number(valueOf('--floors-concurrency') ?? 3));
const cardDelay = () => sleep(500 + Math.floor(Math.random() * 700));

async function looksLikeCaptcha(page) {
  if (/showcaptcha|checkcaptcha/.test(page.url())) return true;
  return page
    .locator('form[action*="checkcaptcha"], .CheckboxCaptcha, .AdvancedCaptcha, .captcha-wrapper')
    .first()
    .isVisible()
    .catch(() => false);
}

// Единственное место, где автоматический режим ждёт человека.
async function passCaptchaIfAny(page) {
  if (!(await looksLikeCaptcha(page))) return false;
  await pauseForUser('Яндекс показал проверку. Пройдите её в окне Chrome.');
  return true;
}

async function gotoWithCaptcha(page, url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    if (!(await passCaptchaIfAny(page))) return;
  }
}

// Поиск карточки — fetch'ем ИЗНУТРИ вкладки (тот же домен и куки, без
// перехода), как у scripts/capture-yandex-nearby.mjs.
async function resolveWithPage(page, entry) {
  if (!page.url().startsWith('https://yandex.by/')) await gotoWithCaptcha(page, 'https://yandex.by/maps/157/minsk/');
  return resolveBuildingOrganization({
    building: entry,
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
    withCoords,
  });
}

const CARD_SELECTOR = '.place-inside-view, .search-business-snippet-view';

// Карточки организаций для этажей: fetch изнутри вкладки, как resolveWithPage.
// CAPTCHA проходит человек в том же окне, после чего запрос повторяется.
function pageFetcher(page) {
  return {
    fetchHtml: (url) => page.evaluate(
      (target) => fetch(target, { credentials: 'include' }).then((response) => response.text()),
      url,
    ),
    onCaptcha: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      await passCaptchaIfAny(page);
      return true;
    },
  };
}

// Без браузера (--node-fetch): для прогона на сервере. Человека нет, поэтому
// на CAPTCHA обход останавливается, найденное к этому моменту сохраняется.
const nodeFetcher = {
  fetchHtml: (url) => fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9',
    },
  }).then((response) => response.text()),
  onCaptcha: async () => false,
};

async function addFloors(organizations, fetcher) {
  const { organizations: withFloor, stats } = await fillTenantFloors(organizations, {
    ...fetcher,
    delay: cardDelay,
    concurrency: floorsConcurrency,
    log: (line) => console.log(line),
    withCoords,
  });
  const total = withFloor.length;
  const coordsLine = withCoords ? `, точки: ${withFloor.filter((organization) => organization.coords).length} из ${total}` : '';
  console.log(`  этажи: ${total - stats.missing} из ${total} (по тексту ${stats.fromText + stats.kept}, по карточкам ${stats.fromCard})${coordsLine}${stats.stopped ? ' — остановлено CAPTCHA' : ''}`);
  return { organizations: withFloor, stopped: stats.stopped };
}

// Вкладка «Внутри» собственной карточки организации здания.
async function collectFromOrganization(page, entry, org) {
  const url = orgUrl(org, 'inside');
  await gotoWithCaptcha(page, url);
  await page.waitForSelector(CARD_SELECTOR, { timeout: 12_000 }).catch(() => {});
  if (!isOrgTabUrl(page.url(), org.id, 'inside')) {
    console.log(`  вкладка «Внутри» не открылась (адрес ${page.url()})`);
    return null;
  }
  const organizations = (await scrollAndCollect(page, entry, url, [], null))
    .filter((organization) => organization.sourceId !== org.id);
  return { organizations, finalUrl: page.url(), html: await page.content() };
}

// Страница дома: по yandex_url или поиском по адресу. Вкладку «Организации
// внутри» открываем сами: клик по ней, а если он не сработал — переход по её
// ссылке (/maps/…/house/<id>/inside/). Для поиска по адресу — сверка, что Яндекс привёл к дому рядом с нашими координатами
// (ll в адресе страницы дома), а не к соседнему адресу.
async function collectFromHouse(page, entry, building) {
  const url = building.yandexUrl ?? `https://yandex.by/maps/157/minsk/search/${encodeURIComponent(building.address)}/`;
  await gotoWithCaptcha(page, url);
  const link = page.locator('.tabs-select-view__title._name_inside a[href*="/inside/"]').first();
  await link.waitFor({ state: 'attached', timeout: 12_000 }).catch(() => {});
  const href = await link.getAttribute('href', { timeout: 2_000 }).catch(() => null);
  if (!href || !/\/house\//.test(href)) {
    console.log(`  «${building.address}»: страница дома с вкладкой «Организации внутри» не открылась`);
    return null;
  }
  // Сначала клик — как делал человек: внутри открытой карты список
  // подгружается при прокрутке. Прямой переход по ссылке отдаёт первые 25
  // карточек готовым HTML; он — запасной путь, если клик не сработал.
  await link.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForURL(/\/inside\//, { timeout: 5_000 }).catch(() => {});
  if (!/\/inside\//.test(page.url())) await gotoWithCaptcha(page, new URL(href, page.url()).href);
  await page.waitForSelector(CARD_SELECTOR, { timeout: 12_000 }).catch(() => {});
  if (!building.yandexUrl) {
    const ll = new URL(page.url()).searchParams.get('ll')?.split(',').map(Number);
    const lat = Number(entry.lat);
    const lng = Number(entry.lng);
    if (ll && ll.length === 2 && ll.every(Number.isFinite) && Number.isFinite(lat) && Number.isFinite(lng)) {
      const distance = haversineMeters({ lat, lng }, { lat: ll[1], lng: ll[0] });
      if (distance > maxDistance) {
        console.log(`  «${building.address}»: Яндекс открыл дом в ${Math.round(distance)} м от здания — не то место`);
        return null;
      }
    }
  }
  const organizations = await scrollAndCollect(page, { ...entry, address: building.address }, page.url(), [], null);
  return { organizations, finalUrl: page.url(), html: await page.content() };
}

// Одна карточка на два здания каталога — неоднозначность: второму зданию
// её «Внутри» не отдаём, у него остаётся страница дома.
const orgOwners = new Map();

// Сначала «Внутри» карточки ТЦ, потом — всегда — страница дома, и списки
// объединяются по id организации. Одной карточки мало: у Комаровского
// рынка во «Внутри» 66 организаций, а на странице дома — 143, у ЦУМ — 33
// против 48 (прогоны 2026-09-23). Дом сверяется с координатами найденной
// карточки, а без неё — с координатами здания из базы.
async function collectAuto(page, entry) {
  let org = await resolveWithPage(page, entry);
  if (org && orgOwners.has(org.id) && orgOwners.get(org.id) !== entry.slug) {
    console.log(`  карточка ${org.name} (${org.id}) уже досталась ${orgOwners.get(org.id)} — её не беру`);
    org = null;
  } else if (org) orgOwners.set(org.id, entry.slug);

  const merged = new Map();
  const via = [];
  let primary = null;
  if (org) {
    console.log(`  карточка: ${org.name} (${org.rubric}), id ${org.id}, ${org.distance} м, запрос «${org.query}»`);
    const result = await collectFromOrganization(page, entry, org);
    const count = result ? withDefaultCategory(result.organizations).length : 0;
    console.log(`  «Внутри» карточки: ${count}`);
    if (result && count > 0) {
      for (const organization of result.organizations) merged.set(organization.sourceId, organization);
      via.push(`карточка ${org.id} «Внутри» ${count}`);
      primary = result;
    }
    await randomDelay();
  } else {
    console.log('  своей карточки организации не нашлось — только страница дома');
  }

  const buildings = Array.isArray(entry.buildings) && entry.buildings.length > 0
    ? entry.buildings
    : [{ address: entry.address, yandexUrl: entry.yandexUrl }];
  const reference = org ? { ...entry, lat: org.lat, lng: org.lng } : entry;
  for (const building of buildings) {
    const result = await collectFromHouse(page, reference, building);
    if (!result) continue;
    const count = withDefaultCategory(result.organizations).length;
    console.log(`  страница дома «${building.address}»: ${count}`);
    for (const organization of result.organizations) {
      if (org && organization.sourceId === org.id) continue;
      if (!merged.has(organization.sourceId)) merged.set(organization.sourceId, organization);
    }
    if (count > 0) via.push(`дом ${count}`);
    primary ??= result;
    await randomDelay();
  }
  if (!primary || merged.size === 0) return null;
  return { ...primary, organizations: [...merged.values()], via: via.join(' + ') };
}

async function writeSnapshot(snapshot) {
  const organizations = withDefaultCategory(snapshot.organizations);
  const row = {
    business_center_slug: snapshot.slug,
    source: 'yandex_maps',
    source_url: snapshot.sourceUrl,
    address_query: snapshot.address,
    organizations,
    organization_count: organizations.length,
    captured_at: snapshot.capturedAt,
  };
  if (serviceRoleKey) {
    const client = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await client.from('business_center_tenant_source_snapshots').upsert(row, { onConflict: 'business_center_slug,source' });
    if (error) throw error;
    const { error: centerError } = await client
      .from('business_centers')
      .update({ tenant_organizations: organizations })
      .eq('slug', snapshot.slug);
    if (centerError) throw centerError;
    return;
  }
  const literal = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const sql = `insert into public.business_center_tenant_source_snapshots (business_center_slug,source,source_url,address_query,organizations,organization_count,captured_at) values (${literal(row.business_center_slug)},'yandex_maps',${literal(row.source_url)},${literal(row.address_query)},${literal(JSON.stringify(row.organizations))}::jsonb,${row.organization_count},${literal(row.captured_at)}::timestamptz) on conflict (business_center_slug,source) do update set source_url=excluded.source_url,address_query=excluded.address_query,organizations=excluded.organizations,organization_count=excluded.organization_count,captured_at=excluded.captured_at; update public.business_centers set tenant_organizations = ${literal(JSON.stringify(organizations))}::jsonb where slug = ${literal(snapshot.slug)};`;
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

await fs.mkdir(outputRoot, { recursive: true });

async function saveCheckpoint(entry, organizations, sourceUrl, capturedAt, { db = writeDb } = {}) {
  const cleanedOrganizations = withDefaultCategory(organizations);
  const dir = path.join(outputRoot, entry.slug);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'latest.json');
  const temporary = `${target}.tmp`;
  const snapshot = { ...entry, sourceUrl, capturedAt, complete: false, organizations: cleanedOrganizations };
  await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2));
  await fs.rename(temporary, target);
  if (db) {
    await writeSnapshot({
      slug: entry.slug,
      address: entry.address ?? '',
      sourceUrl,
      capturedAt,
      organizations: cleanedOrganizations,
    });
  }
  console.log(`${entry.slug}: контрольная точка — ${cleanedOrganizations.length} организаций`);
}

async function readCheckpoint(slug) {
  try {
    const raw = await fs.readFile(path.join(outputRoot, slug, 'latest.json'), 'utf8');
    const snapshot = JSON.parse(raw);
    return Array.isArray(snapshot.organizations) ? snapshot.organizations : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

// Слаги, у которых уже есть снимок source=yandex_maps — тот же дуальный
// доступ (service-role или Management API), что и у writeSnapshot: таблице
// business_center_tenant_source_snapshots анон-ключ закрыт миграцией.
async function collectedSlugs() {
  if (serviceRoleKey) {
    const client = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await client
      .from('business_center_tenant_source_snapshots')
      .select('business_center_slug')
      .eq('source', 'yandex_maps');
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.business_center_slug));
  }
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "select business_center_slug from public.business_center_tenant_source_snapshots where source = 'yandex_maps';" }),
  });
  if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const rows = await response.json();
  return new Set(rows.map((row) => row.business_center_slug));
}

async function catalogEntries() {
  const client = createClient(supabaseUrl, anonKey);
  let centersQuery = client
    .from('business_centers')
    .select('slug,name,address,status,sort_order,lat,lng')
    .eq('status', 'built')
    .order('sort_order', { ascending: true });
  if (catalogKind !== 'all') centersQuery = centersQuery.eq('kind', catalogKind);
  if (onlySlugs.length > 0) centersQuery = centersQuery.in('slug', onlySlugs);
  // При --skip-collected лимит применяем ПОСЛЕ фильтрации уже собранных —
  // иначе --limit по sort_order мог бы целиком попасть на готовые БЦ и
  // вернуть пустой список, хотя дальше в каталоге есть несобранные.
  if (limit > 0 && !skipCollected) centersQuery = centersQuery.limit(limit);
  const { data: rawCenters, error: centersError } = await centersQuery;
  if (centersError) throw centersError;

  let centers = rawCenters ?? [];
  if (skipCollected) {
    const done = await collectedSlugs();
    centers = centers.filter((center) => !done.has(center.slug));
    if (limit > 0) centers = centers.slice(0, limit);
  }

  const slugs = centers.map((center) => center.slug);
  let buildingPages = [];
  if (slugs.length > 0) {
    const { data, error } = await client
      .from('business_center_yandex_buildings')
      .select('business_center_slug,address,yandex_url,sort_order')
      .in('business_center_slug', slugs)
      .order('sort_order', { ascending: true });
    // До применения миграции PostgREST вернёт 42P01. Обычные однокорпусные
    // здания всё равно можно собрать по адресу из business_centers.
    if (!error) buildingPages = data ?? [];
    else if (error.code !== '42P01' && error.code !== 'PGRST205') throw error;
  }

  return centers.map((center) => {
    const buildings = buildingPages
      .filter((building) => building.business_center_slug === center.slug)
      .map((building) => ({ address: building.address, yandexUrl: building.yandex_url }));
    return {
      slug: center.slug,
      name: center.name,
      address: center.address,
      lat: center.lat,
      lng: center.lng,
      buildings: buildings.length > 0 ? buildings : [{ address: center.address }],
    };
  });
}

let entries;
if (archivePath) entries = [{ slug: onlySlug, address: '', archivePath }];
else if (inputPath) {
  entries = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'));
  if (onlySlugs.length > 0) entries = entries.filter((entry) => onlySlugs.includes(entry.slug));
  if (limit > 0) entries = entries.slice(0, limit);
} else entries = await catalogEntries();

if (entries.length === 0) throw new Error('Не найдено ни одного БЦ для обработки');
if (listOnly) {
  console.log(JSON.stringify(entries, null, 2));
  process.exit(0);
}

// Прежние снимки зданий — для --floors-only (тот же дуальный доступ).
async function readSnapshots(slugs) {
  if (slugs.length === 0) return new Map();
  let rows;
  if (serviceRoleKey) {
    const client = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await client
      .from('business_center_tenant_source_snapshots')
      .select('business_center_slug,source_url,address_query,organizations,captured_at')
      .eq('source', 'yandex_maps')
      .in('business_center_slug', slugs);
    if (error) throw error;
    rows = data ?? [];
  } else {
    const list = slugs.map((slug) => `'${slug.replaceAll("'", "''")}'`).join(',');
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `select business_center_slug,source_url,address_query,organizations,captured_at from public.business_center_tenant_source_snapshots where source = 'yandex_maps' and business_center_slug in (${list});` }),
    });
    if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    rows = await response.json();
  }
  return new Map(rows.map((row) => [row.business_center_slug, row]));
}

// Только этажи: список организаций не пересобирается, берётся прежний снимок,
// дописывается floor, снимок сохраняется с прежней датой сбора.
if (floorsOnly) {
  const snapshots = await readSnapshots(entries.map((entry) => entry.slug));
  const queue = entries.filter((entry) => {
    const organizations = snapshots.get(entry.slug)?.organizations;
    return Array.isArray(organizations)
      && organizations.some((organization) => !organization.floor || (withCoords && !organization.coords));
  });
  console.log(`Зданий с неполными ${withCoords ? 'этажами или точками' : 'этажами'}: ${queue.length} из ${entries.length}`);
  let context = null;
  let fetcher = nodeFetcher;
  if (!nodeFetch && queue.length > 0) {
    context = await chromium.launchPersistentContext(
      profileDir,
      launchOptions({ headless, chromePath, windowSize, windowPosition }),
    );
    const page = context.pages()[0] ?? await context.newPage();
    await gotoWithCaptcha(page, 'https://yandex.by/maps/157/minsk/');
    fetcher = pageFetcher(page);
  }
  try {
    for (const [index, entry] of queue.entries()) {
      const snapshot = snapshots.get(entry.slug);
      console.log(`\n[${index + 1}/${queue.length}] ${entry.name ?? entry.slug}`);
      const { organizations, stopped } = await addFloors(snapshot.organizations, fetcher);
      if (writeDb) {
        await writeSnapshot({
          slug: entry.slug,
          address: snapshot.address_query ?? entry.address ?? '',
          sourceUrl: snapshot.source_url,
          capturedAt: snapshot.captured_at,
          organizations,
        });
        console.log(`  ${entry.slug}: записано в базу`);
      }
      if (stopped) {
        console.log('Яндекс показал CAPTCHA — остановился. Повторите ту же команду позже: готовые здания пропускаются.');
        break;
      }
    }
  } finally {
    if (context) await context.close();
  }
  if (!writeDb) console.log('\nВ базу НЕ писали — добавьте --write-db');
  process.exit(0);
}

// Автоматический режим: один браузер на весь прогон, без Enter на зданиях.
if (autoMode && !archivePath) {
  console.log(`Зданий в очереди: ${entries.length}. Открываю Chrome — окно можно двигать, но не закрывайте его.`);
  const context = await chromium.launchPersistentContext(
    profileDir,
    launchOptions({ headless, chromePath, windowSize, windowPosition }),
  );
  const page = context.pages()[0] ?? await context.newPage();
  const empty = [];
  let done = 0;
  let total = 0;
  try {
    for (const [index, entry] of entries.entries()) {
      if (!entry.slug) throw new Error('У записи нет slug');
      console.log(`\n[${index + 1}/${entries.length}] ${entry.name ?? entry.slug} — ${entry.address ?? ''}`);
      const capturedAt = new Date().toISOString();
      const result = await collectAuto(page, entry);
      let organizations = result ? withDefaultCategory(result.organizations) : [];
      if (organizations.length > 0 && withFloors) {
        organizations = (await addFloors(organizations, pageFetcher(page))).organizations;
      }
      if (organizations.length === 0) {
        // Ноль не пишем никуда: прежний список в базе и latest.json остаётся.
        console.log(`  ${entry.slug}: организаций не собрано — ничего не пишу`);
        empty.push(entry.slug);
        await randomDelay();
        continue;
      }
      const dir = path.join(outputRoot, entry.slug);
      await fs.mkdir(dir, { recursive: true });
      const stamp = capturedAt.replaceAll(':', '-');
      await fs.writeFile(path.join(dir, `${stamp}.html`), result.html);
      await saveWebarchive(path.join(dir, `${stamp}.webarchive`), result.html, result.finalUrl);
      const { buildings: _buildings, ...entryMeta } = entry;
      const completed = { ...entryMeta, sourceUrl: result.finalUrl, capturedAt, complete: true, via: result.via, organizations };
      await fs.writeFile(path.join(dir, `${stamp}.json`), JSON.stringify(completed, null, 2));
      await fs.writeFile(path.join(dir, 'latest.json.tmp'), JSON.stringify(completed, null, 2));
      await fs.rename(path.join(dir, 'latest.json.tmp'), path.join(dir, 'latest.json'));
      if (writeDb) {
        await writeSnapshot({ slug: entry.slug, address: entry.address ?? '', sourceUrl: result.finalUrl, capturedAt, organizations });
      }
      done += 1;
      total += organizations.length;
      console.log(`${entry.slug}: сохранено ${organizations.length} организаций (${result.via})${writeDb ? ', записано в базу' : ''}`);
      await randomDelay();
    }
  } finally {
    await context.close();
  }
  console.log(`\nГотово: ${done} зданий, ${total} организаций${writeDb ? '' : ' (в базу НЕ писали — добавьте --write-db)'}`);
  if (empty.length > 0) {
    console.log(`Не собрано (${empty.length}), прежние данные не тронуты: ${empty.join(',')}`);
    console.log('Их можно добрать вручную: --manual --slug <список через запятую>');
  }
  process.exit(0);
}

for (const entry of entries) {
  if (!entry.slug) throw new Error('У записи нет slug');
  const capturedAt = new Date().toISOString();
  let sourceUrl, organizations;
  if (entry.archivePath) {
    const html = await webarchiveHtml(entry.archivePath);
    sourceUrl = html.match(/<base[^>]+href="([^"]+)"/)?.[1] ?? 'https://yandex.by/maps/';
    organizations = extractFromHtml(html, sourceUrl);
    await saveCheckpoint(entry, organizations, sourceUrl, capturedAt);
    const dir = path.join(outputRoot, entry.slug);
    const stamp = capturedAt.replaceAll(':', '-');
    await fs.writeFile(path.join(dir, `${stamp}.html`), html);
    await saveWebarchive(path.join(dir, `${stamp}.webarchive`), html, sourceUrl);
  } else {
    const buildings = Array.isArray(entry.buildings) && entry.buildings.length > 0
      ? entry.buildings
      : [{ address: entry.address, yandexUrl: entry.yandexUrl }];
    organizations = await readCheckpoint(entry.slug);
    for (let index = 0; index < buildings.length; index += 1) {
      const building = { ...entry, ...buildings[index], buildings: undefined };
      const result = await collectLive(
        building,
        organizations,
        (currentOrganizations, currentUrl) => saveCheckpoint(entry, currentOrganizations, currentUrl, capturedAt),
      );
      organizations = result.organizations;
      sourceUrl = result.finalUrl;
      const dir = path.join(outputRoot, entry.slug);
      await fs.mkdir(dir, { recursive: true });
      const stamp = capturedAt.replaceAll(':', '-');
      const suffix = buildings.length > 1 ? `-building-${index + 1}` : '';
      await fs.writeFile(path.join(dir, `${stamp}${suffix}.html`), result.html);
      await saveWebarchive(path.join(dir, `${stamp}${suffix}.webarchive`), result.html, sourceUrl);
    }
  }
  const dir = path.join(outputRoot, entry.slug);
  await fs.mkdir(dir, { recursive: true });
  const stamp = capturedAt.replaceAll(':', '-');
  organizations = withDefaultCategory(organizations);
  const completed = { ...entry, sourceUrl, capturedAt, complete: true, organizations };
  await fs.writeFile(path.join(dir, `${stamp}.json`), JSON.stringify(completed, null, 2));
  await fs.writeFile(path.join(dir, 'latest.json.tmp'), JSON.stringify(completed, null, 2));
  await fs.rename(path.join(dir, 'latest.json.tmp'), path.join(dir, 'latest.json'));
  // saveCheckpoint() пишет в БД только из onProgress — а он ни разу не
  // срабатывает, если организаций 0 (found.size никогда не становится
  // больше previous=0). Без этой безусловной записи такой БЦ каждый раз
  // проваливал --skip-collected и пересобирался заново (так было с aden).
  if (writeDb) {
    await writeSnapshot({ slug: entry.slug, address: entry.address ?? '', sourceUrl, capturedAt, organizations });
  }
  console.log(`${entry.slug}: сохранено ${organizations.length} организаций`);
}
