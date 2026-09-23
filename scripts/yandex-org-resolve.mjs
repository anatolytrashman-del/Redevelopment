// Собственная карточка организации здания на Яндекс.Картах — без человека.
//
// Зачем (владелец, 2026-09-23): сбор отзывов и «Организаций внутри» для
// каталога ТЦ должен идти одной командой, без «откройте нужную карточку и
// нажмите Enter» на каждом из 139 зданий. Для этого нужен id организации
// самого здания (ТЦ/рынка/универмага), а в базе он не хранится.
//
// Как ищем: та же страница поиска Яндекс.Карт, что у инфраструктуры рядом
// (scripts/capture-yandex-nearby.mjs — searchUrl/extractStateView/
// extractCandidates оттуда), с центром карты на координатах здания. Первый
// кандидат брать нельзя: по «Замок» у самого ТРЦ «Замок» Яндекс отдаёт
// «3D Кино» — кинотеатр ВНУТРИ него (проверено 2026-09-23). Поэтому кандидат
// проходит три проверки сразу:
//   1) организация (числовой id, рубрика на русском — не «похожие рядом»);
//   2) рубрика торгового формата (ТЦ, рынок, универмаг, аутлет, мебельный/
//      строительный центр, гипермаркет, автоцентр…);
//   3) название совпадает с коротким названием из «…» (после нормализации)
//      или машинный слаг Яндекса совпадает с нашим slug, и до наших
//      координат не дальше maxDistance (400 м; для рубрики самого ТЦ с тем
//      же именем — до 1 км, а при совпавших улице и доме — любое: у части
//      ТЦ в базе координаты не того места).
// Здание без названия («Торговый центр на Жиновича, 7») и имя в другой
// записи («Avia Mall» ↔ «Авиа Молл») сверяются по адресу: улица и дом.
// Ничего не прошло — здание НЕ резолвится, и вызывающий скрипт ничего за него
// не пишет: лучше пустое место в списке, чем отзывы кинотеатра на странице ТЦ.

import {
  extractCandidates,
  extractStateView,
  looksLikeCaptchaHtml,
  searchUrl,
} from './capture-yandex-nearby.mjs';
import { haversineMeters } from './nearby-places-common.mjs';

export const DEFAULT_MAX_DISTANCE_M = 400;

// Кириллическую границу слова — lookbehind/lookahead по \p{L}: \b в JS
// работает только с ASCII (см. CLAUDE.md).
const GENERIC_WORDS_RE = new RegExp(
  '(?<![\\p{L}\\p{N}])(?:' +
    [
      'торгово развлекательный центр',
      'торгово развлекательный комплекс',
      'торговый центр',
      'торговый комплекс',
      'торговая галерея',
      'центр мебели',
      'мебельный центр',
      'строительный центр',
      'трц',
      'трк',
      'тц',
      'тк',
      'универмаг',
      'автоцентр',
      'автомолл',
      'аутлет',
      'рынок',
    ].join('|') +
    ')(?![\\p{L}\\p{N}])',
  'giu',
);

// Нижний регистр, ё→е, без кавычек/пунктуации и без родовых слов («ТЦ»,
// «Торговый центр», «рынок»…) — сравниваются только собственные имена.
export function normalizeOrgName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(GENERIC_WORDS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// «ТРЦ «Замок»» → «Замок»; без кавычек — полное название.
export function shortNameOf(name) {
  const text = String(name ?? '').trim();
  const quoted = text.match(/«(.+)»/);
  return quoted ? quoted[1].trim() : text;
}

export function isQuotedName(name) {
  return /«.+»/.test(String(name ?? ''));
}

// Варианты собственного имени: как есть, без уточнения в скобках
// («Алми (Дзержинского)» → «Алми»), без хвоста «на/в …» («Гиппо на
// Городецкой» → «Гиппо») — у Яндекса у сетевых ТЦ имя без адресного хвоста.
export function nameVariants(name) {
  const short = shortNameOf(name);
  const noParens = short.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const noTail = noParens.replace(/\s+(?:на|в|во)\s+.+$/iu, '').trim();
  return [...new Set([short, noParens, noTail].map(normalizeOrgName).filter(Boolean))];
}

// Поисковые запросы по порядку: короткое имя, потом «<имя> торговый центр»
// (так находится ТРЦ «Замок», когда по одному «Замок» всплывает кинотеатр
// внутри), потом полное название, как в базе.
export function searchTextsFor(name) {
  const full = String(name ?? '').trim();
  const primary = isQuotedName(full) ? shortNameOf(full).replace(/\s*\([^)]*\)\s*/g, ' ').trim() : full;
  const texts = [primary];
  if (!/торгов|рынок|универмаг/i.test(primary)) texts.push(`${primary} торговый центр`);
  texts.push(full.replace(/[«»]/g, ''));
  return [...new Set(texts.filter(Boolean))];
}

// Рубрика кандидата — «Торговый центр · гипермаркет · zamok · business»:
// русские рубрики, машинный слаг, тег выдачи.
export function parseRubric(rubric) {
  const parts = String(rubric ?? '').split('·').map((part) => part.trim()).filter(Boolean);
  const tag = parts.length > 0 && /^[a-z]+$/.test(parts.at(-1)) ? parts.at(-1) : null;
  const rest = tag ? parts.slice(0, -1) : parts;
  const seoname = rest.length > 0 && /^[a-z0-9_]+$/.test(rest.at(-1)) ? rest.at(-1) : null;
  const rubrics = (seoname ? rest.slice(0, -1) : rest).filter((part) => /[а-яё]/i.test(part));
  return { rubrics, seoname, tag };
}

// A — рубрика самого торгового объекта, B — допустимая, если A нет
// (у «Гиппо» и «Домашнего очага» своей рубрики «торговый центр» нет:
// «продуктовый гипермаркет», «магазин мебели»). Супермаркет и прочие
// магазины не проходят: это арендаторы, а не здание.
const RETAIL_TIER_A_RE = /торгов|развлекательный центр|рынок|универмаг|аутлет|outlet|мебельный центр|строительный центр|автоцентр|авторынок|автомолл/i;
const RETAIL_TIER_B_RE = /гипермаркет|мебел|строительн|стройматериал|автосалон|автозапчаст/i;

export function retailTier(rubrics) {
  const text = rubrics.join(' · ');
  if (RETAIL_TIER_A_RE.test(text)) return 2;
  if (RETAIL_TIER_B_RE.test(text)) return 1;
  return 0;
}

const STREET_PREFIX_RE = /^(?:ул|улица|просп|проспект|пр-т|пр|пер|переулок|пл|площадь|б-р|бульвар|тракт|ш|шоссе|пр-д|проезд|наб|набережная|туп|тупик|мкр|микрорайон)\.?\s+/iu;

// «г. Минск, ул. Иосифа Жиновича, 7» → { streetWords: ['жиновича', …], house: '7' }.
export function parseAddress(address) {
  const parts = String(address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  // «…, 155, корп. 1» — корпус/строение/помещение после дома не нужны.
  while (parts.length > 0 && /^(?:корп|корпус|к\.|стр|строение|пом|помещение|офис|этаж)/iu.test(parts.at(-1))) parts.pop();
  if (parts.length < 2) return null;
  const house = parts.at(-1).toLowerCase().replace(/\s+/g, '').replace(/^д\.?/, '').match(/^\d+[а-яa-z]?/u)?.[0];
  if (!house) return null;
  const street = parts.at(-2).replace(STREET_PREFIX_RE, '').replace(/\s+(?:ул|просп|пер|пр-т)\.?$/iu, '');
  const streetWords = normalizeOrgName(street).split(' ').filter((w) => w.length >= 4);
  if (streetWords.length === 0) return null;
  return { streetWords, house };
}

function addressMatches(ours, candidateAddress) {
  if (!ours) return false;
  const theirs = parseAddress(`x, ${String(candidateAddress ?? '')}`);
  if (!theirs) return false;
  if (theirs.house !== ours.house) return false;
  return ours.streetWords.some((word) => theirs.streetWords.includes(word));
}

function slugForms(slug) {
  const s = String(slug ?? '').toLowerCase();
  return [...new Set([s, s.replace(/-tc$/, '')])].filter(Boolean);
}

// Выбор организации здания из кандидатов одной выдачи. Чистая функция —
// покрыта тестом (scripts/yandex-org-resolve.test.js).
export function pickOrganization({ candidates, building, maxDistance = DEFAULT_MAX_DISTANCE_M }) {
  const variants = nameVariants(building.name);
  const ourAddress = parseAddress(building.address);
  const slugs = slugForms(building.slug);
  const center = { lat: Number(building.lat), lng: Number(building.lng) };
  const seen = new Set();
  const scored = [];
  for (const candidate of candidates ?? []) {
    const id = String(candidate.id ?? '');
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    const { rubrics, seoname, tag } = parseRubric(candidate.rubric);
    // «похожие рядом» (tag similar) и слой карты — без русской рубрики.
    if (rubrics.length === 0 || tag === 'similar') continue;
    seen.add(id);
    const tier = retailTier(rubrics);
    if (tier === 0) continue;
    const distance = haversineMeters(center, { lat: candidate.lat, lng: candidate.lng });
    if (!Number.isFinite(distance)) continue;
    const name = normalizeOrgName(candidate.name);
    const seo = seoname ? seoname.replace(/_/g, '-') : null;
    const sameAddress = addressMatches(ourAddress, candidate.address);
    let nameScore = 0;
    if (name && variants.includes(name)) {
      // Имя совпало. Расстояние — обычный порог; для рубрики самого ТЦ до
      // 1 км (у «Яркого» на МКАД точка в базе в 660 м от карточки); при
      // совпавшем адресе — любое: у части ТЦ в базе координаты не того
      // места (ГУМ, Эспланада, Спектр — 2026-09-23), а улица и дом те же.
      if (distance <= maxDistance || (tier === 2 && distance <= 1000) || sameAddress) nameScore = 3;
    } else if (distance <= maxDistance) {
      if (seo && slugs.includes(seo)) nameScore = 2;
      // Карточка торгового объекта ровно по нашему адресу (улица + дом):
      // так находятся безымянные «Торговый центр на Жиновича, 7» и имена в
      // другой записи («Avia Mall» ↔ «Авиа Молл»).
      else if (tier === 2 && sameAddress) nameScore = 2;
      // «magnit-dzerzhinskogo» ↔ слаг Яндекса «magnit»: сеть с адресным
      // хвостом в нашем slug. Слабее имени — только с рубрикой самого ТЦ.
      else if (seo && tier === 2 && slugs.some((slug) => slug.startsWith(`${seo}-`))) nameScore = 1;
    }
    if (nameScore === 0) continue;
    scored.push({
      id,
      name: candidate.name,
      rubric: rubrics.join(' · '),
      seoname,
      address: candidate.address ?? null,
      lat: candidate.lat,
      lng: candidate.lng,
      distance: Math.round(distance),
      nameScore,
      tier,
    });
  }
  scored.sort((a, b) => b.nameScore - a.nameScore || b.tier - a.tier || a.distance - b.distance);
  return scored[0] ?? null;
}

export function orgUrl(org, tab = '') {
  const seo = org.seoname || 'org';
  return `https://yandex.by/maps/org/${seo}/${org.id}/${tab ? `${tab}/` : ''}`;
}

// Адрес страницы — та ли это вкладка той ли организации (защита от записи
// нуля после неудачного перехода: редирект на главную, на другую карточку).
export function isOrgTabUrl(url, orgId, tab) {
  return new RegExp(`/org/(?:[^/]+/)?${orgId}/${tab}(?:/|\\?|$)`).test(String(url ?? ''));
}

/**
 * Найти организацию здания. fetchHtml(url) → HTML страницы поиска;
 * onCaptcha(url) вызывается, когда Яндекс показал проверку (ждёт человека),
 * после него тот же запрос повторяется.
 */
export async function resolveBuildingOrganization({ building, fetchHtml, onCaptcha, log = () => {}, maxDistance, delay }) {
  const center = { lat: Number(building.lat), lng: Number(building.lng) };
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    log('  нет координат здания — искать карточку не по чему');
    return null;
  }
  for (const text of searchTextsFor(building.name)) {
    const url = searchUrl({ text, center });
    let state = null;
    for (let attempt = 1; attempt <= 3 && !state; attempt += 1) {
      let html = '';
      try {
        html = await fetchHtml(url);
      } catch (error) {
        log(`  поиск «${text}»: запрос не прошёл (${String(error?.message ?? error).slice(0, 80)})`);
        if (delay) await delay();
        continue;
      }
      if (looksLikeCaptchaHtml(html)) {
        if (!onCaptcha) throw new Error(`Яндекс показал проверку на поиске «${text}»`);
        await onCaptcha(url);
        continue;
      }
      state = extractStateView(html);
      if (!state) {
        log(`  поиск «${text}»: в ответе нет состояния выдачи`);
        if (delay) await delay();
      }
    }
    if (!state) continue;
    const org = pickOrganization({ candidates: extractCandidates(state), building, maxDistance });
    if (org) return { ...org, query: text };
    log(`  поиск «${text}»: подходящей карточки нет`);
    if (delay) await delay();
  }
  return null;
}

// --- Запуск браузера (общий для сборщиков отзывов и организаций) -----------

// Без окна (--headless) Chrome представляется «HeadlessChrome», и Яндекс
// отвечает страницей «limited» — подставляем обычную строку браузера.
// CHROME_EXTRA_ARGS — дополнительные флаги Chrome через пробел (нужны,
// например, за корпоративным прокси со своим сертификатом).
const HEADLESS_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export function launchOptions({ headless, chromePath, windowSize, windowPosition }) {
  const extra = (process.env.CHROME_EXTRA_ARGS ?? '').split(/\s+/).filter(Boolean);
  if (headless) {
    return {
      headless: true,
      executablePath: chromePath,
      viewport: { width: 1200, height: 900 },
      locale: 'ru-RU',
      userAgent: HEADLESS_USER_AGENT,
      args: extra,
    };
  }
  return {
    headless: false,
    executablePath: chromePath,
    viewport: null,
    args: [`--window-size=${windowSize}`, `--window-position=${windowPosition}`, ...extra],
  };
}
