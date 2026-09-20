// Domovita и Megapolis-real как источники ГОРОДСКИХ сегментов
// (`citywide_offers`), общий модуль для sync-citywide-office-offers.mjs,
// sync-citywide-retail-offers.mjs и sync-citywide-warehouse-offers.mjs.
//
// Почему отдельным модулем, а не копией в каждом скрипте (2026-09-20).
// Три скрипта сегментов — почти копии друг друга (так уж сложилось: каждый
// заводился от предыдущего заменой категории). Вписать в каждый ещё по два
// сборщика — это шесть копий одного разбора вёрстки двух чужих сайтов,
// которая меняется без предупреждения. Ровно про такое предупреждает
// CLAUDE.md в пункте про файлы-близнецы: расхождение заметить нечем, а
// цена ему — разные медианы у соседних сегментов на одних и тех же данных.
// Сборщики Kufar и Realt в этот модуль СОЗНАТЕЛЬНО не вынесены: у них в
// каждом сегменте свои параметры запроса и свой разбор полей, и переписывать
// заодно уже работающее — лишний риск ради красоты.
//
// Обе площадки к этому моменту уже год как проверены и работают в
// sync-business-center-offers.mjs (Domovita — третьим источником, Megapolis —
// пятым, обе с 2026-09-19), но ТОЛЬКО на срезе из 143 зданий нашего
// каталога. Городские сегменты всё это время жили на Kufar + Realt, хотя
// разбор чужой вёрстки уже был написан и отлажен. Этот модуль закрывает
// разрыв: тот же разбор карточки, но без привязки к каталогу БЦ.
//
// Объём на 2026-09-20 (замер вживую, страница 1 каждого раздела):
//   Domovita  — офисы 529, торговые 362, склады 69
//   Megapolis — офисы 738, торговые 660, склады 316
// против 5306 строк, лежавших в citywide_offers на двух источниках.
//
// Машиноместа (сегмент 'mashinomesta') сюда не входят: у обеих площадок
// раздела парковок нет вовсе, sync-citywide-parking-offers.mjs остаётся на
// одном Kufar.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Разделы площадок по нашим сегментам. Названия разделов — те же, что уже
// перечислены в sync-business-center-offers.mjs, менять их надо в обоих
// местах (проверено вживую: пути живые, отдают HTTP 200).
export const EXTRA_SOURCE_SECTIONS = {
  ofisy: { domovita: 'office', megapolis: 'ofisnaya_nedvizhimost' },
  torgovye: { domovita: 'shopping', megapolis: 'torgovaya-nedvizhimost' },
  sklady: { domovita: 'warehouses', megapolis: 'skladskaya-nedvizhimost' },
};

const DOMOVITA_MAX_PAGES = 30; // 20 карточек на страницу
const MEGAPOLIS_MAX_PAGES = 30; // 30 карточек на страницу

// ---------- адрес: общий ключ для схлопывания одного лота с разных площадок ----------

// Каждая площадка пишет адрес по-своему (образцы сняты с живой выдачи
// 2026-09-20):
//   Kufar     "Победителей пр, 63В, Минск"     — тип улицы ПОСЛЕ названия
//   Realt     "Минск Тимирязева ул. 72 3"      — город впереди, запятых нет
//   Domovita  "ул. Интернациональная, д. 38"   — тип улицы ПЕРЕД названием
//   Megapolis "ПОБЕДИТЕЛЕЙ, 108", "пр-т Партизанский, 79", "ХОРУЖЕЙ ВЕРЫ, 25, к.3"
//              — регистр произвольный, тип улицы то есть, то нет
// Поэтому ключ строится не по шаблону строки, а разбором на токены: выкидываем
// город и любые слова-типы улиц, что осталось из букв — название, первый
// токен с цифры — дом.
//
// Прежний ключ (жил по копии в каждом из трёх скриптов) искал в адресе
// буквально подстроку "ул": `/([а-я-]+)\s+ул(?![а-я])/`. Что это значило на
// живых данных, замерено перед правкой: ключ строился лишь у 73% строк Kufar
// и 64% Realt — у всего, что стоит на проспекте, тракте, бульваре или в
// переулке, ключа не было вовсе, и такие лоты НЕ схлопывались между
// площадками никогда. То есть хуже всего дедуп работал ровно на престижных
// адресах, где и стоят бизнес-центры (пр-т Победителей, пр-т Независимости).
const STREET_TYPE_WORDS = new Set([
  'улица', 'ул', 'проспект', 'пр-т', 'пр-кт', 'просп', 'пр',
  'переулок', 'пер', 'тракт', 'бульвар', 'б-р', 'бул',
  'набережная', 'наб', 'шоссе', 'ш', 'площадь', 'пл', 'проезд',
  'дом', 'д', 'корпус', 'корп', 'к', 'строение', 'стр',
  'город', 'г', 'минск', 'область', 'обл', 'район', 'р-н',
]);

export function addressKey(address) {
  if (!address) return null;
  const tokens = String(address)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[\s,.;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const streetParts = [];
  let house = null;
  for (const token of tokens) {
    if (/^\d/.test(token)) {
      // Первый токен, начинающийся с цифры, — номер дома. Буквенный
      // литер оставляем ("63в" ≠ "63"), разделители внутри убираем,
      // чтобы "40/2" и "40-2" сошлись.
      if (house === null) house = token.replace(/[^a-zа-я0-9]/g, '');
      continue;
    }
    if (STREET_TYPE_WORDS.has(token)) continue;
    if (!/^[а-я-]+$/.test(token)) continue; // мусор вроде "с/с", латиница
    streetParts.push(token);
  }

  if (streetParts.length === 0 || !house) return null;
  // Слова названия сортируем: площадки пишут их в разном порядке — Kufar
  // «Веры Хоружей ул, 25», Megapolis «ХОРУЖЕЙ ВЕРЫ, 25». Без сортировки
  // это два разных ключа и один лот считается дважды. Ложных склеек
  // сортировка не даёт: двух разных улиц из одних и тех же слов в разном
  // порядке не бывает.
  return `${[...streetParts].sort().join('')}|${house}`;
}

// Схлопываем один лот, вывешенный сразу на нескольких площадках.
//
// ЭТО ФАЙЛ-БЛИЗНЕЦ src/lib/businessCenterOfferDuplicates.ts (и его копии
// `dedupeBcOffers` в build-market-snapshots.mjs): там то же правило для
// объявлений внутри каталога БЦ, здесь — для городских сегментов. Правится
// одна сторона — правится и вторая, иначе один и тот же лот посчитается в
// сегменте и в карточке БЦ по-разному.
//
// Правило близнеца целиком: совпали тип сделки, площадь (с допуском 0,05 м²)
// и цена за м² (с допуском 10% — источники считают ставку по-разному: Kufar
// выводит её из цены в долларах, Realt отдаёт готовую) — один лот.
// Роль `business_center_slug` здесь играет ключ адреса. Схлопываем ТОЛЬКО
// записи РАЗНЫХ источников: два объявления внутри одной площадки — это чаще
// всего два реальных одинаковых кабинета у одного собственника (поймано
// вживую на «Центрополе»), и выбрасывать их значит занижать предложение.
//
// ЭТАЖ в сравнении НЕ участвует — намеренно, хотя в прежней версии ключа он
// был. У Megapolis в карточке листинга этажа нет вовсе (всегда null), и с
// этажом в ключе ни одна его строка не схлопнулась бы с Kufar ни разу —
// то есть самый крупный из двух новых источников удваивал бы предложение
// по всему городу.
//
// Порядок источников в массиве — это и приоритет: кто пришёл первым, тот и
// остаётся. Скрипты сегментов передают Kufar и Realt раньше двух новых
// площадок, то есть при совпадении выживает запись с более полными полями
// (у Kufar есть тип здания, у Realt — район).
const SIZE_TOLERANCE = 0.05;
const PRICE_TOLERANCE = 0.1;

function samePrice(a, b) {
  const max = Math.max(a, b);
  if (max <= 0) return a === b;
  return Math.abs(a - b) / max <= PRICE_TOLERANCE;
}

export function dedupeAcrossSources(offers) {
  // Раскладываем по адресу и типу сделки, сравниваем только внутри корзины —
  // иначе на городском сегменте это квадрат от нескольких тысяч строк.
  const buckets = new Map();
  const kept = [];
  let dropped = 0;

  for (const offer of offers) {
    const addr = addressKey(offer.address);
    const size = Number(offer.size);
    const price = Number(offer.price_per_sqm);
    if (!addr || !Number.isFinite(size) || !Number.isFinite(price)) {
      kept.push(offer); // не с чем сравнивать — оставляем как есть
      continue;
    }

    const bucketKey = `${offer.deal_type}|${addr}`;
    const bucket = buckets.get(bucketKey) ?? [];
    const twin = bucket.find(
      (c) =>
        Math.abs(c.size - size) <= SIZE_TOLERANCE &&
        samePrice(c.price, price) &&
        c.sources.every((s) => s !== offer.source),
    );

    if (twin) {
      twin.sources.push(offer.source);
      dropped++;
      continue;
    }

    bucket.push({ size, price, sources: [offer.source] });
    buckets.set(bucketKey, bucket);
    kept.push(offer);
  }

  return { offers: kept, dropped };
}

// ---------- удаление пропавших объявлений ----------

// Объявления, которых в этом прогоне уже нет (сняты с площадки), надо убрать
// из таблицы. Раньше все три скрипта делали это одним запросом
// `.not('ad_id', 'in', '(<все id прогона>)')` — то есть складывали весь
// список id в URL. Пока источников было два, это работало; на четырёх
// сломалось: прогон торговых помещений 2026-09-20 упал с «Bad Request» —
// у Kufar в сегменте стало 1342 объявления, и строка запроса перевалила за
// лимит длины. Вставка к тому моменту уже прошла, так что в таблице
// осталась смесь свежих и устаревших строк.
//
// Поэтому наоборот: вычитываем id, которые лежат в таблице СЕЙЧАС, считаем
// разницу у себя и удаляем пачками по 200. Чтение обязательно постранично —
// PostgREST отдаёт максимум 1000 строк (см. CLAUDE.md), а объявлений в
// сегменте больше, и без `.range()` хвост потерялся бы МОЛЧА: устаревшие
// строки просто остались бы в базе навсегда.
// Страховка перед вставкой: в одной пачке не должно быть двух строк с
// одинаковым (source, ad_id) — на таком upsert Postgres роняет ВСЮ команду
// («ON CONFLICT DO UPDATE command cannot affect row a second time»), то
// есть десять минут сбора уходят впустую. Один раз это уже случилось на
// офисах (id объявления Domovita оказался уникальным лишь внутри раздела,
// см. комментарий у ad_id ниже). Лучше потерять одну строку и сказать об
// этом в лог, чем не записать ничего.
export function dropDuplicateAdIds(offers) {
  const seen = new Set();
  const kept = [];
  const collisions = [];
  for (const offer of offers) {
    const key = `${offer.source}|${offer.ad_id}`;
    if (seen.has(key)) {
      collisions.push(key);
      continue;
    }
    seen.add(key);
    kept.push(offer);
  }
  return { offers: kept, collisions };
}

const DELETE_CHUNK = 200;

export async function deleteStaleOffers({ supabase, segment, sources, offers }) {
  let removed = 0;

  for (const source of sources) {
    const keptIds = new Set(offers.filter((o) => o.source === source).map((o) => o.ad_id));

    const existingIds = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('citywide_offers')
        .select('ad_id')
        .eq('segment', segment)
        .eq('source', source)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      existingIds.push(...data.map((r) => r.ad_id));
      if (data.length < PAGE) break;
    }

    const stale = existingIds.filter((id) => !keptIds.has(id));
    for (let i = 0; i < stale.length; i += DELETE_CHUNK) {
      const chunk = stale.slice(i, i + DELETE_CHUNK);
      const { error } = await supabase
        .from('citywide_offers')
        .delete()
        .eq('segment', segment)
        .eq('source', source)
        .in('ad_id', chunk);
      if (error) throw error;
    }
    removed += stale.length;
  }

  return removed;
}

// ---------- Domovita ----------

// Разбор карточки — тот же, что в sync-business-center-offers.mjs
// (`parseDomovitaCards`), плюс район: в каталоге БЦ он не нужен (район берётся
// из карточки здания), а городским сегментам он даёт срез по районам.
// В карточке район лежит строкой вида "Центральный район / Ленина" — второе
// через слэш это микрорайон, он нам не нужен.
function domovitaCardText(cardHtml) {
  return cardHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '|')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/(\|\s*)+/g, '|');
}

function parseDomovitaCards(html) {
  const cards = html.split('class="found_full"').slice(1);
  const parsed = [];
  for (const rawCard of cards) {
    const links = [...rawCard.matchAll(/href="(https:\/\/domovita\.by\/minsk\/[a-z-]+\/(?:rent|sale)\/[^"]+)"/g)];
    if (links.length === 0) continue;
    // Обрезаем по началу следующей карточки, чтобы её площадь и цена не
    // затекли в эту.
    const card = links.length > 1 ? rawCard.slice(0, links[1].index) : rawCard;
    const text = domovitaCardText(card);

    const adId = card.match(/data-object-button-ajax="(\d+)"/)?.[1] ?? null;
    const address = text.match(/в Минске,\s*([^|]+)/)?.[1]?.trim() ?? null;
    // "|151м|2|" — именно площадь; "36 р. за м|2|" и "1001 ₽/м|2|" под это
    // не подходят, там между числом и "м" стоит валюта.
    const sizeRaw = text.match(/\|(\d[\d\s]*(?:[.,]\d+)?)м\|2\|/)?.[1] ?? null;
    const priceRaw = text.match(/\|(\d[\d\s]*(?:[.,]\d+)?)\s*\$\/м\|2\|/)?.[1] ?? null;
    const floorRaw = text.match(/(\d+)\s*этаж из/)?.[1] ?? null;
    const districtRaw = text.match(/\|([А-ЯЁ][а-яё]+)\s+район(?:\s*\/[^|]*)?\|/)?.[1] ?? null;
    if (!adId || !address || !sizeRaw || !priceRaw) continue;

    const toNumber = (v) => Number(v.replace(/\s/g, '').replace(',', '.'));
    parsed.push({
      adId,
      address,
      district: districtRaw,
      size: toNumber(sizeRaw),
      pricePerSqm: toNumber(priceRaw),
      floor: floorRaw ? Number(floorRaw) : null,
      adLink: links[0][1],
    });
  }
  return parsed;
}

// Страницу за последней Domovita отдаёт как 404 (проверено вживую: раздел
// складов в аренду — две страницы, третья 404). Это не ошибка, а конец
// списка, поэтому 404 отдаём наверх как null и на нём останавливаемся;
// любой другой не-200 — настоящая поломка, её роняем.
async function fetchDomovitaPage(sectionPath, dealSlug, page) {
  const url = new URL(`https://domovita.by/minsk/${sectionPath}/${dealSlug}`);
  if (page > 1) url.searchParams.set('page', String(page));
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html', 'Accept-Language': 'ru' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Domovita (${sectionPath}/${dealSlug}, стр. ${page}) вернул ${res.status}`);
  return res.text();
}

export async function collectDomovitaOffers({ sectionPath, propertyType, isPlausiblePrice, excluded, log }) {
  const offers = [];
  for (const { slug, dealType } of [
    { slug: 'rent', dealType: 'rent' },
    { slug: 'sale', dealType: 'sale' },
  ]) {
    const seenOnSection = new Set();
    for (let page = 1; page <= DOMOVITA_MAX_PAGES; page++) {
      const html = await fetchDomovitaPage(sectionPath, slug, page);
      if (html === null) break; // страница за последней
      const cards = parseDomovitaCards(html);
      if (cards.length === 0) break;

      // Страховка на случай, если площадка вместо 404 начнёт отдавать
      // повтор последней страницы: без неё цикл крутится до потолка
      // страниц и тянет одни и те же карточки.
      const fresh = cards.filter((c) => !seenOnSection.has(c.adId));
      if (fresh.length === 0) break;
      for (const c of fresh) seenOnSection.add(c.adId);

      for (const card of fresh) {
        const adLink = card.adLink;
        if (!isPlausiblePrice(dealType, card.pricePerSqm)) {
          excluded.push({ source: 'Domovita', dealType, size: card.size, pricePerSqm: card.pricePerSqm, adLink });
          continue;
        }
        offers.push({
          source: 'Domovita',
          // Число из `data-object-button-ajax` уникально в пределах раздела,
          // но НЕ глобально: id 10409 встретился и в аренде офисов (пер.
          // Козлова, 7/Г), и в продаже (ул. Полтавская, 10) — два разных
          // объявления. При ключе `(segment, source, ad_id)` это роняет
          // всю вставку целиком («ON CONFLICT DO UPDATE command cannot
          // affect row a second time»), причём после десяти минут сбора.
          // Поэтому раздел и тип сделки — часть ключа.
          ad_id: `${sectionPath}-${slug}-${card.adId}`,
          deal_type: dealType,
          property_type: propertyType,
          building_type: null, // в карточке листинга поля нет
          size: card.size,
          price_per_sqm: card.pricePerSqm,
          floor: card.floor,
          district: card.district,
          address: card.address,
          ad_link: adLink,
        });
      }

      await new Promise((r) => setTimeout(r, 300)); // не долбим чужой сайт подряд
    }
    log?.(`Domovita (${sectionPath}/${slug}): годных объявлений — ${offers.filter((o) => o.deal_type === dealType).length}`);
  }
  return offers;
}

// ---------- Megapolis-real ----------

// Разбор — тот же, что в sync-business-center-offers.mjs
// (`parseMegapolisCards`). Своя ловушка площадки: часть объявлений сразу на
// несколько помещений показывает площадь ДИАПАЗОНОМ («23 - 100») —
// единственную площадь тогда не определить, такие пропускаем (~3% выдачи).
// Рекламные баннеры получают тот же класс секции, но без `data-go-url`.
//
// Поле `price_usd` — цена именно ЗА М², проверено по карточкам (1275 $/м² ×
// 2517 м² = 3 209 175 $ в поле итога). Изредка попадается карточка, где
// агент вписал в это поле цену за объект целиком, и площадка честно
// показывает «2 047 624 $ / м²», а итог считает в два миллиарда — это
// ошибка первоисточника, не разбора. Такие отсекает общий фильтр
// правдоподобности цены (`isPlausiblePrice`), чинить их на нашей стороне
// нечем: угадывать, что имел в виду автор объявления, мы не будем.
//
// РАЙОНА в карточке листинга нет — ни отдельным полем, ни в адресе
// (проверено по всем классам `rInfo_*` живой карточки). Строки Megapolis
// поэтому ложатся с district = null: в городской срез они попадают, в срезы
// по районам — нет. Выдумывать район по адресу (сопоставлением с каталогом
// улиц) не стали: ошибка тут молча испортит именно тот срез, ради которого
// это делалось бы.
function parseMegapolisCards(html) {
  const sections = html.match(/<section class="rItem[^"]*">[\s\S]*?<\/section>/g) ?? [];
  const cards = [];
  for (const sec of sections) {
    const urlMatch = sec.match(/data-go-url="([^"]+)"/);
    if (!urlMatch) continue; // рекламный баннер под тем же классом секции
    const adId = sec.match(/class="rInfo_code">код\s*([^<]*)</)?.[1]?.trim();
    const city = sec.match(/class="rInfo_punkt">([^<]*)</)?.[1]?.trim();
    const address = sec.match(/class="rInfo_address[^"]*">([^<]*)</)?.[1]?.trim();
    const areaRaw = sec.match(/class="rInfo_square"><span>([^<]*)<\/span>/)?.[1]?.trim();
    const priceRaw = sec.match(
      /class="rInfo_price no_go list_price_switcher price_usd"[^>]*><span[^>]*>([^<]*)<\/span>/,
    )?.[1]?.trim();
    if (!adId || !address || !areaRaw || !priceRaw) continue;
    if (areaRaw.includes('-')) continue; // диапазон площадей на несколько помещений сразу
    if (!/^г?\.?\s*минск$/i.test(city ?? '')) continue; // область и пригород — не городской сегмент
    const size = Number(areaRaw.replace(',', '.'));
    const pricePerSqm = Number(priceRaw.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(size) || !Number.isFinite(pricePerSqm)) continue;
    cards.push({ adId, address, size, pricePerSqm, adLink: `https://megapolis-real.by${urlMatch[1]}` });
  }
  return cards;
}

async function fetchMegapolisPage(sectionPath, dealSlug, page) {
  const url = new URL(`https://megapolis-real.by/realt/${sectionPath}/${dealSlug}/`);
  // Страница 1 живёт на базовом URL без query, ?page=1 отдаёт 404
  // (проверено вживую) — параметр ставим только со второй страницы.
  if (page > 1) url.searchParams.set('page', String(page));
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html', 'Accept-Language': 'ru' },
  });
  if (res.status === 404) return null; // страница за последней, как и у Domovita
  if (!res.ok) throw new Error(`Megapolis (${sectionPath}/${dealSlug}, стр. ${page}) вернул ${res.status}`);
  return res.text();
}

export async function collectMegapolisOffers({ sectionPath, propertyType, isPlausiblePrice, excluded, log }) {
  const offers = [];
  for (const { slug, dealType } of [
    { slug: 'arenda', dealType: 'rent' },
    { slug: 'prodazha-pokupka', dealType: 'sale' },
  ]) {
    const seenOnSection = new Set();
    for (let page = 1; page <= MEGAPOLIS_MAX_PAGES; page++) {
      const html = await fetchMegapolisPage(sectionPath, slug, page);
      if (html === null) break; // страница за последней
      const cards = parseMegapolisCards(html);
      if (cards.length === 0) break;

      const fresh = cards.filter((c) => !seenOnSection.has(c.adId));
      if (fresh.length === 0) break;
      for (const c of fresh) seenOnSection.add(c.adId);
      const hasNextPage = html.includes(`page=${page + 1}`);

      for (const card of fresh) {
        if (!isPlausiblePrice(dealType, card.pricePerSqm)) {
          excluded.push({
            source: 'Megapolis',
            dealType,
            size: card.size,
            pricePerSqm: card.pricePerSqm,
            adLink: card.adLink,
          });
          continue;
        }
        offers.push({
          source: 'Megapolis',
          ad_id: card.adId,
          deal_type: dealType,
          property_type: propertyType,
          building_type: null,
          size: card.size,
          price_per_sqm: card.pricePerSqm,
          floor: null, // в карточке листинга этажа нет
          district: null, // см. комментарий выше
          address: card.address,
          ad_link: card.adLink,
        });
      }

      if (!hasNextPage) break;
      await new Promise((r) => setTimeout(r, 300)); // не долбим чужой сайт подряд
    }
    log?.(`Megapolis (${sectionPath}/${slug}): годных объявлений — ${offers.filter((o) => o.deal_type === dealType).length}`);
  }
  return offers;
}
