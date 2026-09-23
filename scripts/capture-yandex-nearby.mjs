#!/usr/bin/env node
// Сбор «Инфраструктуры рядом» браузером на машине владельца — как сбор
// организаций (scripts/capture-yandex-bc-tenants.mjs). CAPTCHA не обходим:
// если Яндекс её показал, скрипт останавливается и ждёт человека. В
// остальное время идёт сам, без Enter на каждое здание (владелец,
// 2026-09-20: за прогон организаций проверку не спросили ни разу).
//
// Почему не через API: ключей Яндекса на 141 здание не хватает (бесплатный
// лимит Places API — 500 запросов в сутки, а прогон каталога это больше
// тысячи). Скрипт через API остался рядом — scripts/sync-bc-nearby-places.mjs;
// общие правила (радиусы, категории, запись) у них ОДНИ на двоих, в
// scripts/nearby-places-common.mjs.
//
// ОДИН ВИЗИТ НА ЗДАНИЕ (требование владельца, 2026-09-20). Страница Яндекс
// Карт открывается один раз, дальше все категории ищутся ВНУТРИ неё через
// строку поиска — это SPA, перезагрузки страницы не происходит, и CAPTCHA
// не спрашивают заново на каждую категорию. Браузер вообще один на весь
// прогон: между зданиями окно не закрывается.
//
// Откуда берутся точки: в HTML страницы поиска Яндекс.Карт лежит блок
// <script class="state-view"> — полное состояние выдачи, включая координаты
// организаций, станций метро и остановок. Скрипт не «кликает» по выдаче, а
// запрашивает эти страницы ИЗНУТРИ уже открытой вкладки (обычный fetch по
// своему же домену, с её куками): перехода нет, вкладка одна, а разбор идёт
// по проверенному HTML, а не по недокументированным ответам внутреннего API.
//
// Метро и остановки приезжают в том же состоянии с ЛЮБЫМ запросом — это
// слой транспорта на карте, а не результат поиска (проверено на четырёх
// живых выдачах 2026-09-20: аптека, магазин, кафе, банкомат — в каждой по
// 2 станции и 8 остановок вокруг здания). Поэтому отдельных запросов на
// метро и остановки нет: лишний запрос — лишний повод показать CAPTCHA.
//
// Запуск:
//   node scripts/capture-yandex-nearby.mjs --slug port --write-db --debug-dump
//        — одно здание, с сохранением сырых страниц: так проверяем первый раз;
//   node scripts/capture-yandex-nearby.mjs --skip-collected --write-db
//        — весь каталог, пропуская уже собранное (можно прерывать и запускать снова);
//   node scripts/capture-yandex-nearby.mjs --from-cache --write-db
//        — дописать в базу то, что уже лежит в tmp/, без браузера;
//   node scripts/capture-yandex-nearby.mjs --only-missing-reviews --write-db
//        — только здания без ни одного текстового отзыва с Яндекса (тот же
//          список, что --missing-only в scripts/capture-yandex-reviews.mjs) —
//          первый заход, инфраструктура и отзывы для одного и того же куска
//          каталога;
//   node scripts/capture-yandex-nearby.mjs --exclude-missing-reviews --write-db
//        — второй заход, остаток каталога (здания, где отзыв уже есть).
//
// Флаги: --limit N, --slug SLUG, --skip-collected, --max-age-days 45,
// --only-missing-reviews, --exclude-missing-reviews (взаимоисключающие),
// --only-categories pharmacy,bank, --pause (подтверждать каждое здание
// вручную), --delay 2000 (фиксированная пауза вместо случайной 1–3 с),
// --debug-dump, --output DIR, --profile DIR, --city-path 157/minsk.
//
// Переменные окружения: SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN
// (для --write-db и --skip-collected), CHROME_PATH — если Chrome не в
// стандартном месте, CHROME_WINDOW_SIZE / CHROME_WINDOW_POSITION — чтобы
// окно не закрывало терминал, в котором нужно жать Enter.

import './local-supabase-env.mjs'; // первым: ключ из ~/.config/redevelopment/supabase.env
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import {
  SOURCE,
  SUPABASE_URL,
  categoryFromRubric,
  dedupePlaces,
  haversineMeters,
  radiusFor,
  readCenters,
  slugsWithYandexReviews,
  writePlaces,
} from './nearby-places-common.mjs';

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
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
const fromCache = has('--from-cache');
const debugDump = has('--debug-dump');
const skipCollected = has('--skip-collected');
// Резать очередь по тому же списку «где ещё нет ни одного текстового отзыва
// с Яндекса», что и --missing-only в scripts/capture-yandex-reviews.mjs
// (общая проверка — slugsWithYandexReviews в nearby-places-common.mjs), а не
// по двум независимо посчитанным спискам: --only-missing-reviews — первый
// заход (там же, где не хватает отзывов, заодно собрать инфраструктуру),
// --exclude-missing-reviews — второй заход, остаток каталога (владелец,
// 2026-09-22: сначала здания без отзывов — инфраструктура и отзывы вместе,
// потом отдельной командой доснять инфраструктуру у остальных).
const onlyMissingReviews = has('--only-missing-reviews');
const excludeMissingReviews = has('--exclude-missing-reviews');
// --no-browser: те же страницы поиска, но запрошенные обычным fetch'ем, без
// Chrome. Работает, пока Яндекс не попросит проверку (а он попросит тем
// скорее, чем меньше запрос похож на живого человека) — поэтому это не
// замена браузерному прогону, а быстрая попытка обойтись без него.
const noBrowser = has('--no-browser');
// По умолчанию скрипт идёт сам: Яндекс на прогоне владельца (2026-09-20) ни
// разу не спросил CAPTCHA, и нажимать Enter на каждое здание — лишняя работа
// руками. Пауза остаётся там, где без человека никак: если проверка всё-таки
// появилась. --pause возвращает прежнее поведение (подтверждать каждое
// здание вручную), --delay задаёт паузу перед сбором в миллисекундах.
const manualPause = has('--pause');
const autoDelayMs = Number(valueOf('--delay') ?? 0);
const onlyCategories = (valueOf('--only-categories') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const outputRoot = path.resolve(valueOf('--output') ?? 'tmp/yandex-bc-nearby');
// Профиль тот же, что у сбора организаций: в нём уже лежат куки Яндекса,
// а значит CAPTCHA спрашивают реже.
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

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

// Что именно ищем на каждом здании. Один визит — все эти запросы подряд,
// поэтому список держим коротким: каждый лишний запрос это ещё один шанс
// получить CAPTCHA на ровном месте.
//
// 'кафе' и 'ресторан' — по-прежнему два разных поисковых запроса (по одному
// текстовому запросу заведения другого типа не всегда всплывают в выдаче),
// но оба падают в одну и ту же итоговую категорию 'cafe' — конкретный тип
// определяет рубрика (RUBRIC_RULES в nearby-places-common.mjs), а не то,
// каким запросом заведение нашли; `category` здесь — это fallback ТОЛЬКО
// для «похожих рядом» без рубрики на кириллице. 'кофейня'/'кофе' — тоже два
// запроса под одну категорию 'coffee' (владелец, 2026-09-21: «давай соберем
// кофейни отдельно») по той же причине, что у кафе/ресторана: Яндекс
// ранжирует выдачу по каждому запросу отдельно и обрезает её примерно на
// 25 организациях — «Paul» (297 м, рубрика «Кондитерская · кафе · пекарня»)
// не попал в топ выдачи «кофейня» у БЦ «Силуэт», но нашёлся по «кофе»
// (владелец, 2026-09-22, проверено на живой выдаче). Это не гарантия
// полного покрытия — Яндекс так же может обрезать и объединённый список,
// просто с двумя формулировками шанс поймать заведение выше.
export const NEARBY_QUERIES = [
  { category: 'grocery', text: 'продуктовый магазин' },
  { category: 'pharmacy', text: 'аптека' },
  { category: 'bank', text: 'банк' },
  { category: 'atm', text: 'банкомат' },
  { category: 'coffee', text: 'кофейня' },
  { category: 'coffee', text: 'кофе' },
  { category: 'cafe', text: 'кафе' },
  { category: 'cafe', text: 'ресторан' },
  { category: 'fitness', text: 'фитнес клуб' },
];

// Запасные запросы: если транспортный слой почему-то не приехал ни с одной
// выдачей, спрашиваем прямо. В обычном прогоне не выполняются.
export const FALLBACK_QUERIES = [
  { category: 'metro', text: 'метро' },
  { category: 'transport_stop', text: 'остановка общественного транспорта' },
];

// --- Разбор ответов внутреннего API --------------------------------------

function readPoint(value) {
  const fromPair = (pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const lng = Number(pair[0]);
    const lat = Number(pair[1]);
    // Яндекс, как и GeoJSON, отдаёт [долгота, широта] — порядок именно такой.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };
  const fromObject = (object) => {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
    const lat = Number(object.lat ?? object.latitude ?? object.y);
    const lng = Number(object.lon ?? object.lng ?? object.longitude ?? object.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };
  return (
    fromPair(value.coordinates) ??
    fromObject(value.coordinates) ??
    fromPair(value.point) ??
    fromObject(value.point) ??
    fromPair(value.geometry?.coordinates) ??
    fromObject(value.geometry) ??
    null
  );
}

function readName(value) {
  for (const key of ['name', 'title', 'displayName', 'shortName']) {
    const candidate = value[key];
    if (typeof candidate === 'string') {
      const name = candidate.replace(/\s+/g, ' ').trim();
      if (name && name.length <= 200 && !/^https?:\/\//.test(name)) return name;
    }
    // Иногда имя приезжает объектом {text: "..."} — так у части ответов Карт.
    if (candidate && typeof candidate === 'object' && typeof candidate.text === 'string') {
      const name = candidate.text.replace(/\s+/g, ' ').trim();
      if (name && name.length <= 200) return name;
    }
  }
  return null;
}

function readRubric(value) {
  const names = [];
  for (const key of ['categories', 'rubrics', 'Categories']) {
    const list = value[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string') names.push(item);
      else if (item && typeof item.name === 'string') names.push(item.name);
      else if (item && typeof item.class === 'string') names.push(item.class);
    }
  }
  for (const key of ['category', 'categoryName', 'rubric', 'seoname', 'type']) {
    if (typeof value[key] === 'string') names.push(value[key]);
  }
  return names.join(' · ') || null;
}

function readId(value) {
  for (const key of ['id', 'oid', 'permalink', 'businessId', 'logId']) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
    if (typeof candidate === 'string' && /^[\w:/-]{1,64}$/.test(candidate)) return candidate;
  }
  return '';
}

function readAddress(value) {
  for (const key of ['address', 'description', 'fullAddress', 'addressLine']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.replace(/\s+/g, ' ').trim();
    if (candidate && typeof candidate === 'object' && typeof candidate.formattedAddress === 'string') {
      return candidate.formattedAddress.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

// Проходим JSON насквозь и собираем всё, у чего есть имя и координаты. Это
// намеренно «широкий невод»: лишнее отсекается дальше — расстоянием до
// здания и радиусом категории.
export function extractCandidates(value, depth = 0, out = []) {
  if (!value || typeof value !== 'object' || depth > 14) return out;
  if (Array.isArray(value)) {
    for (const item of value) extractCandidates(item, depth + 1, out);
    return out;
  }
  const point = readPoint(value);
  const name = point ? readName(value) : null;
  if (point && name) {
    out.push({
      name,
      lat: point.lat,
      lng: point.lng,
      id: readId(value),
      rubric: readRubric(value),
      address: readAddress(value),
    });
  }
  for (const child of Object.values(value)) extractCandidates(child, depth + 1, out);
  return out;
}

// В выдаче Яндекса живут четыре разных вида объектов, и различаются они не
// только рубрикой, но и формой id (проверено на живых выдачах 2026-09-20):
//   station__9880196 — станция метро (по одной записи на каждый выход),
//   stop__10045236   — остановка транспорта,
//   159900781874     — организация, прямое попадание на запрос; рубрика на
//                      русском («Аптека · …», «Ресторан · кафе · бар · …»).
//   159900781874     — организация из виджета «похожие рядом» на той же
//                      странице: id той же числовой формы, но рубрики на
//                      русском нет — только машинный слаг и тег в конце
//                      («skif · similar»). Это тоже настоящие заведения
//                      (проверено 2026-09-20: без них список кафе/ресторанов
//                      терял 2/3 реальных точек — see docs/session-journal.md).
// Слой карты без карточки (парки, подписи улиц, здания-ориентиры) — тоже без
// кириллицы в рубрике, но с тегом «common», а не «similar»: их отбрасываем,
// у «Парка Горького» рубрики для группировки взять неоткуда.
//
// «Похожие рядом» у Яндекса — соседи по карте, не обязательно того же типа
// заведения, поэтому categoryFromRubric fallback-ом брать нельзя вслепую для
// всех категорий: найдено 2026-09-22 на живых 10 БЦ — «Шиколад» (на самом
// деле салон красоты) всплыл похожим под «фитнес клуб» и ушёл в fitness,
// «1Teh» (магазин электроники) — под «продуктовый магазин» и ушёл в grocery.
// Для кафе/кофеен это работает надёжно (там «похожие» и правда почти всегда
// того же типа — проверено на живых выдачах, 0 промахов), для остального
// доверия недостаточно: без своей рубрики на кириллице такой кандидат
// лучше вообще не показывать, чем показать под случайной категорией.
const SIMILAR_FALLBACK_CATEGORIES = new Set(['cafe', 'coffee']);
//
// 'station__' — не только метро: у станций БЖД (Минск-Пасс., Минск-Восточный,
// Минск-Северный, Ждановичи и т.п.) тот же префикс, только с инфиксом
// (`station__lh_9613989`) и рубрикой `common`, как у обычного шума карты —
// без проверки самой рубрики они утекали в метро (владелец, 2026-09-21:
// «в список попадали жд станции»; найдено на живой выдаче у БЦ «Титул»:
// «Минск-Пасс.» — id `station__lh_9613989`, rubric `common`, тогда как у
// настоящих станций метро id всегда голое число после `station__`, а
// rubric — ровно `metro`).
export function classifyCandidate(candidate, fallbackCategory) {
  const id = String(candidate.id ?? '');
  const rubric = String(candidate.rubric ?? '');
  if (id.startsWith('station__') && rubric.trim().toLowerCase() === 'metro') return 'metro';
  if (id.startsWith('stop__')) return 'transport_stop';
  if (!/^\d+$/.test(id)) return null;
  if (/[а-яё]/i.test(rubric)) return categoryFromRubric(rubric, fallbackCategory);
  if (/\bsimilar$/i.test(rubric.trim()) && SIMILAR_FALLBACK_CATEGORIES.has(fallbackCategory)) return fallbackCategory;
  return null;
}

// Одна станция метро приезжает столько раз, сколько у неё выходов, и у
// каждого выхода свой id — по id такие записи не склеятся. Поэтому у метро
// и остановок ключ по имени: в блоке нужна станция, а не её вестибюли.
function sourcePlaceId(category, candidate) {
  if (category === 'metro' || category === 'transport_stop') {
    return `${category}:${candidate.name.toLocaleLowerCase('ru-RU').trim()}`;
  }
  return String(candidate.id ?? '');
}

// Кандидаты → строки таблицы: категория по форме id и рубрике, отсев по
// радиусу именно этой категории.
export function candidatesToPlaces({ candidates, center, fallbackCategory, collectedAt }) {
  const places = [];
  for (const candidate of candidates) {
    const category = classifyCandidate(candidate, fallbackCategory);
    if (!category) continue;
    const distance = haversineMeters(center, { lat: candidate.lat, lng: candidate.lng });
    if (distance > radiusFor(category)) continue;
    const isOrganization = /^\d+$/.test(String(candidate.id ?? ''));
    places.push({
      business_center_slug: center.slug,
      source_place_id: sourcePlaceId(category, candidate),
      name: candidate.name,
      category,
      subcategory: isOrganization ? candidate.rubric : null,
      address: candidate.address,
      lat: candidate.lat,
      lng: candidate.lng,
      distance_meters: distance,
      source: SOURCE,
      source_url: isOrganization ? `https://yandex.ru/maps/org/${candidate.id}` : null,
      collected_at: collectedAt,
      // Не станция/остановка (там категория однозначна по форме id) и не
      // «похожие рядом» без рубрики на кириллице (там категория — просто
      // fallback запроса, под которым виджет всплыл, а не настоящий тип
      // места) — см. dedupePlaces в nearby-places-common.mjs. Поле служебное,
      // dedupePlaces вырезает его из итоговых строк, в базу не пишется.
      _reliableCategory: !isOrganization || /[а-яё]/i.test(String(candidate.rubric ?? '')),
    });
  }
  return places;
}

// Состояние выдачи из HTML страницы поиска. Сущности раскодируем сами:
// Яндекс кладёт JSON внутрь <script> уже экранированным под HTML.
export function extractStateView(html) {
  const match = String(html).match(/<script type="application\/json" class="state-view">([\s\S]*?)<\/script>/);
  if (!match) return null;
  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function looksLikeCaptchaHtml(html) {
  return /SmartCaptcha|checkcaptcha|Подтвердите, что запросы отправляли вы/i.test(String(html));
}

// --- Браузер --------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Пауза перед сбором: дать карте дорисоваться (и человеку — увидеть, что
// открылось нужное здание). 1–3 секунды случайно, а не ровно столько же
// каждый раз: одинаковый ритм запросов — самый простой признак робота.
async function settleBeforeCollect(message) {
  if (manualPause) {
    await pauseForUser(message);
    return;
  }
  const wait = autoDelayMs > 0 ? autoDelayMs : 1000 + Math.floor(Math.random() * 2000);
  console.log(`${message}\n  жду ${(wait / 1000).toFixed(1)} с и начинаю сбор…`);
  await sleep(wait);
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

// Минск в адресах Яндекс.Карт — 157. Все БЦ каталога минские; для другого
// города путь меняется флагом --city-path.
const CITY_PATH = valueOf('--city-path') ?? '157/minsk';

export function searchUrl({ text, center, cityPath = CITY_PATH }) {
  return `https://yandex.by/maps/${cityPath}/search/${encodeURIComponent(text)}/?ll=${center.lng},${center.lat}&z=17`;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Запрос выдачи ИЗНУТРИ открытой вкладки: тот же домен, те же куки, но без
// перехода — вкладка остаётся на здании, а значит визит по-прежнему один.
// В режиме --no-browser вкладки нет вовсе, и страница берётся обычным fetch.
async function fetchSearchHtml(page, url) {
  if (!page) {
    const response = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
  return page.evaluate(
    (target) => fetch(target, { credentials: 'include' }).then((response) => response.text()),
    url,
  );
}

const randomDelay = () => (autoDelayMs > 0 ? autoDelayMs : 1000 + Math.floor(Math.random() * 2000));

// Проверка в режиме без браузера — тупик: проходить её некому, дальше
// прогон продолжает браузерный путь.
class CaptchaError extends Error {}

async function collectForCenter({ page, center, capturedAt, onDebug }) {
  const queries = onlyCategories.length
    ? NEARBY_QUERIES.filter((query) => onlyCategories.includes(query.category))
    : NEARBY_QUERIES;
  const collected = [];

  const runQuery = async (query) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const url = searchUrl({ text: query.text, center });
      let html = '';
      try {
        html = await fetchSearchHtml(page, url);
      } catch (error) {
        console.log(`  ${query.text}: запрос не прошёл (${error.message.slice(0, 80)}), повтор`);
        await sleep(randomDelay());
        continue;
      }
      if (looksLikeCaptchaHtml(html)) {
        if (!page) throw new CaptchaError(`Яндекс показал проверку на запросе «${query.text}»`);
        // Единственное место, где без человека никак: открываем ту же
        // выдачу в самой вкладке, чтобы проверку было где пройти.
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
        await pauseForUser(`Яндекс показал проверку на запросе «${query.text}». Пройдите её в окне Chrome.`);
        continue;
      }
      const state = extractStateView(html);
      if (!state) {
        console.log(`  ${query.text}: в ответе нет состояния выдачи, повтор`);
        await sleep(randomDelay());
        continue;
      }
      if (onDebug) await onDebug(query.category, html);
      const places = candidatesToPlaces({
        candidates: extractCandidates(state),
        center,
        fallbackCategory: query.category,
        collectedAt: capturedAt,
      });
      collected.push(...places);
      console.log(`  ${query.text}: ${places.length} точек в радиусе`);
      return places;
    }
    console.log(`  ${query.text}: пропущено после трёх попыток`);
    return [];
  };

  for (const query of queries) {
    await runQuery(query);
    await sleep(randomDelay());
  }

  // Транспорт приезжает слоем карты с любой выдачей. Если не приехал —
  // спрашиваем явно, чтобы метро и остановки были у каждого здания
  // (владелец, 2026-09-20: они обязательная часть блока).
  for (const fallback of FALLBACK_QUERIES) {
    if (collected.some((place) => place.category === fallback.category)) continue;
    console.log(`  транспорт не приехал слоем — спрашиваю «${fallback.text}»`);
    await runQuery(fallback);
    await sleep(randomDelay());
  }

  return dedupePlaces(collected);
}

// --- Прогон ---------------------------------------------------------------

async function saveSnapshot(slug, payload) {
  const dir = path.join(outputRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'latest.json');
  await fs.writeFile(`${target}.tmp`, JSON.stringify(payload, null, 2));
  await fs.rename(`${target}.tmp`, target);
}

async function readSnapshot(slug) {
  try {
    return JSON.parse(await fs.readFile(path.join(outputRoot, slug, 'latest.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function main() {
  if (!fromCache && !noBrowser && !chromePath) {
    console.error('Chrome не найден. Укажите полный путь через переменную CHROME_PATH');
    process.exit(1);
  }
  if (onlyMissingReviews && excludeMissingReviews) {
    console.error('--only-missing-reviews и --exclude-missing-reviews взаимоисключающие');
    process.exit(1);
  }
  if ((writeDb || skipCollected || onlyMissingReviews || excludeMissingReviews) && !serviceRoleKey && !accessToken) {
    console.error('Нужен SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }

  let supabase = null;
  if (serviceRoleKey) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, serviceRoleKey);
  }

  const centers = await readCenters({ supabase, accessToken, kind: catalogKind });
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const withYandexReviews = onlyMissingReviews || excludeMissingReviews
    ? await slugsWithYandexReviews({ supabase, accessToken })
    : null;
  let queue = centers.filter((center) => {
    if (onlySlugs.length > 0 && !onlySlugs.includes(center.slug)) return false;
    if (onlyMissingReviews && withYandexReviews.has(center.slug)) return false;
    if (excludeMissingReviews && !withYandexReviews.has(center.slug)) return false;
    if (!skipCollected) return true;
    if (!center.collected_at) return true;
    return Date.now() - new Date(center.collected_at).getTime() > maxAgeMs;
  });
  if (limit > 0) queue = queue.slice(0, limit);

  if (listOnly) {
    console.log(JSON.stringify(queue.map(({ slug, name, address }) => ({ slug, name, address })), null, 2));
    return;
  }
  if (queue.length === 0) {
    console.log('Нечего собирать: все выбранные БЦ уже со свежим снимком');
    return;
  }

  if (fromCache) {
    let written = 0;
    for (const center of queue) {
      const snapshot = await readSnapshot(center.slug);
      if (!snapshot?.places?.length) continue;
      if (writeDb) await writePlaces({ supabase, accessToken, slug: center.slug, places: snapshot.places });
      written += 1;
      console.log(`${center.slug}: ${snapshot.places.length} точек из файла${writeDb ? ' записано в базу' : ''}`);
    }
    console.log(`Готово из кэша: ${written} БЦ`);
    return;
  }

  let context = null;
  let page = null;
  if (noBrowser) {
    console.log(`БЦ в очереди: ${queue.length}. Режим без браузера: страницы поиска запрашиваю напрямую.`);
  } else {
    console.log(`БЦ в очереди: ${queue.length}. Открываю Chrome — окно можно двигать, но не закрывайте его.`);
    // Playwright подгружается только здесь: режиму --no-browser он не нужен,
    // и требовать установленный пакет ради запуска без браузера незачем.
    const { chromium } = await import('playwright-core');
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      executablePath: chromePath,
      viewport: null,
      args: [`--window-size=${windowSize}`, `--window-position=${windowPosition}`],
    });
    page = context.pages()[0] ?? (await context.newPage());
  }

  let done = 0;
  let totalPlaces = 0;
  try {
    for (const row of queue) {
      const center = { slug: row.slug, lat: Number(row.lat), lng: Number(row.lng) };
      const capturedAt = new Date().toISOString();
      const url = `https://yandex.by/maps/${CITY_PATH}/?ll=${center.lng},${center.lat}&z=17`;
      if (page) {
        // Единственный переход на здание. Дальше — только поиск внутри страницы.
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
      await settleBeforeCollect(
        `\n[${done + 1}/${queue.length}] ${row.name ?? row.slug} — ${row.address ?? ''}`,
      );
      // Проверку ищем сами: если Яндекс всё-таки спросил — тут без человека
      // никак, и только здесь скрипт ждёт Enter.
      if (page && (await looksLikeCaptcha(page))) {
        await pauseForUser('Яндекс показал проверку. Пройдите её в окне Chrome.');
      }

      const places = await collectForCenter({
        page,
        center,
        capturedAt,
        onDebug: debugDump
          ? async (category, html) => {
              const dir = path.join(outputRoot, center.slug, 'raw');
              await fs.mkdir(dir, { recursive: true });
              await fs.writeFile(path.join(dir, `${category}.html`), html);
            }
          : null,
      });

      const byCategory = places.reduce((acc, place) => {
        acc[place.category] = (acc[place.category] ?? 0) + 1;
        return acc;
      }, {});
      await saveSnapshot(center.slug, { slug: center.slug, capturedAt, sourceUrl: url, places });
      if (writeDb) await writePlaces({ supabase, accessToken, slug: center.slug, places });
      done += 1;
      totalPlaces += places.length;
      console.log(
        `${done}/${queue.length} ${center.slug}: ${places.length} точек (${
          Object.entries(byCategory).map(([key, value]) => `${key} ${value}`).join(', ') || 'пусто'
        })${writeDb ? ', записано в базу' : ''}`,
      );
    }
  } catch (error) {
    if (error instanceof CaptchaError) {
      console.error(`\n${error.message}. Собрано БЦ: ${done}. Дальше — браузерным прогоном (без --no-browser).`);
      process.exitCode = 2;
    } else throw error;
  } finally {
    await context?.close();
  }

  console.log(`Готово: ${done} БЦ, ${totalPlaces} точек${writeDb ? '' : ' (в базу НЕ писали — добавьте --write-db)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
