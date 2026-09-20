// Domovita, Megapolis-real, Garantiruem и Pro-N.by как источники ГОРОДСКИХ
// сегментов (`citywide_offers`), общий модуль для sync-citywide-office-
// offers.mjs, sync-citywide-retail-offers.mjs и sync-citywide-warehouse-
// offers.mjs.
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
// Объём на 2026-09-20, живой прогон (годных объявлений после фильтра
// цены, ДО схлопывания дублей между площадками):
//   Domovita    — офисы 121, торговые 89,  склады 41
//   Megapolis   — офисы 211, торговые 330, склады 157
//   Garantiruem — офисы 81,  торговые 84,  склады 9
//   Pro-N.by    — офисы 156, торговые 16,  склады 17
// Итог по citywide_offers: 5306 → 6311 строк (офисы 2465→3132, торговые
// 1817→2496, склады 474→683). Garantiruem и Pro-N добавлены в тот же
// заход, что и разведка остальных 18 площадок из топ-20 владельца — оба
// разобраны сильнее остальных: своя доля лотов у Garantiruem ~80%, у
// Pro-N ~27% (полный разбор — docs/analytics-sources.md).
//
// Машиноместа (сегмент 'mashinomesta') сюда не входят: ни у одной из
// четырёх площадок раздела парковок нет, sync-citywide-parking-offers.mjs
// остаётся на одном Kufar.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// garantiruem.by и pro-n.by режут обычный `fetch()` (Node/undici) по
// TLS/HTTP-отпечатку раньше любых заголовков — тот же запрос curl'ом
// проходит 200, node fetch с теми же заголовками получает 403 (проверено
// вживую 2026-09-20, разница только в клиенте). Domovita и Megapolis этим
// не страдают — их трогать не стал, чтобы не менять уже рабочий код без
// нужды. Обходной путь — звать системный curl из Node: он есть и в этой
// песочнице, и на раннерах GitHub Actions (`ubuntu-latest`) без установки.
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const execFileAsync = promisify(execFile);
const CURL_STATUS_MARKER = '\n__CURL_HTTP_STATUS__';

async function curlFetch(url, { headers = {}, cookieJarPath } = {}) {
  const args = ['-sS', '-m', '25', '-w', `${CURL_STATUS_MARKER}%{http_code}`];
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`);
  if (cookieJarPath) args.push('-b', cookieJarPath, '-c', cookieJarPath);
  args.push(url);
  const { stdout } = await execFileAsync('curl', args, { maxBuffer: 25 * 1024 * 1024 });
  const markerIndex = stdout.lastIndexOf(CURL_STATUS_MARKER);
  const status = Number(stdout.slice(markerIndex + CURL_STATUS_MARKER.length));
  const text = stdout.slice(0, markerIndex);
  return { status, ok: status >= 200 && status < 300, text: () => Promise.resolve(text) };
}

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

// ---------- Garantiruem ----------
// Шестой и седьмой источник городских сегментов (2026-09-20) — по итогам
// разведки топ-20 сайтов, присланного владельцем (docs/analytics-sources.md).
// Агентство «Гарантируем» (garantiruem.by). Разведка (субагент, вживую):
// 190 лотов аренды + 28 продажи, ~80% которых нет ни у Kufar, ни у Realt —
// лучшая своя доля из девяти проверенных в тот же заход площадок.
//
// Устройство страницы — редкий случай, когда парсить проще, чем обычно: обе
// страницы раздела (`/lease/commerce/`, `/sale/commerce/`) отдают ВСЕ свои
// объекты сразу в одном инлайн-скрипте `new JCObjectMap([...])` —
// пагинация вообще не нужна, один GET на раздел. Синтаксис внутри — валидный
// JS-литерал массива объектов с одиночными кавычками; в Node парсим
// вручную (JSON.parse не подходит из-за одиночных кавычек, `eval` — нет).
//
// Тип помещения в этом массиве НЕТ — только на странице самого объявления
// (`<div class="obtt">Офис</div>` и рядом `Назначение: Офис`). Зато оттуда
// же и площадь, и цена, и этаж, и НДС — надёжнее любой догадки по
// заголовку («Аренда помещения по адресу...» не говорит вообще ничего).
// Заголовки без типа — это генерическое «Помещение», больше половины пула
// (86 из 190 аренды) — по CLAUDE.md такие не угадываем, просто не считаем
// ни в один из трёх сегментов (ofisy/torgovye/sklady).
const GARANTIRUEM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Значения поля "Тип помещения" на детальной странице — прилагательные
// («Офисное», не «Офис»), сверено вживую (см. комментарий у
// fetchGarantiruemObjectType). Не путать со словарём Pro-N.by ниже — там
// то же смысловое значение приходит в форме существительного.
const GARANTIRUEM_TYPE_MAP = {
  Офисное: 'Офисы',
  Торговое: 'Торговые помещения',
  Складское: 'Склады',
  // 'Помещение' (нет такого варианта — генерическое отсутствие значения),
  // 'Производственное' и подобные — сознательно не маппим ни в один
  // сегмент, см. комментарий выше про заголовок без типа.
};

async function fetchGarantiruemList(sectionPath) {
  const res = await curlFetch(`https://garantiruem.by/${sectionPath}/`, {
    headers: { 'User-Agent': GARANTIRUEM_UA, Accept: 'text/html', 'Accept-Language': 'ru' },
  });
  if (!res.ok) throw new Error(`Garantiruem (${sectionPath}) вернул ${res.status}`);
  const html = await res.text();
  const match = html.match(/new JCObjectMap\((\[[\s\S]*?\])\)/);
  if (!match) throw new Error(`Garantiruem (${sectionPath}): не нашёл JCObjectMap — вероятно, поменялась вёрстка`);

  // Одиночные кавычки, простые строковые/числовые значения, без вложенных
  // объектов кроме slider_img (массив строк) — безопасно разобрать одним
  // regexp'ом на объект, без eval.
  const objects = [];
  for (const objRaw of match[1].split(/\},\s*\{/)) {
    const fields = {};
    for (const m of objRaw.matchAll(/'(\w+)':\s*(?:'([^']*)'|\[[^\]]*\])/g)) {
      fields[m[1]] = m[2] ?? null;
    }
    if (fields.id && fields.href) objects.push(fields);
  }
  return objects;
}

async function fetchGarantiruemObjectType(href) {
  const res = await curlFetch(`https://garantiruem.by${href}`, {
    headers: { 'User-Agent': GARANTIRUEM_UA, Accept: 'text/html', 'Accept-Language': 'ru' },
  });
  if (!res.ok) return { type: null, floor: null, district: null };
  const html = await res.text();
  const type = html.match(/<li class="number_of_storeys">\s*<strong>([^<]*)<\/strong>\s*<p>Тип помещения<\/p>/)?.[1]?.trim() ?? null;
  const floor = html.match(/<li class="floor">\s*<strong>(\d+)\s*<span>/)?.[1] ?? null;
  const district = html.match(/<span>([^<]*район)<\/span>/)?.[1]?.trim() ?? null;
  return { type, floor: floor ? Number(floor) : null, district };
}

// Детальные страницы дёргаем с ограниченным параллелизмом — 190+28 штук,
// но по одной странице на объект (в отличие от Domovita/Megapolis, где
// одна страница листинга даёт разом десятки карточек).
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function collectGarantiruemOffers({ propertyType, isPlausiblePrice, excluded, log }) {
  const offers = [];
  for (const [sectionPath, dealType] of [
    ['lease/commerce', 'rent'],
    ['sale/commerce', 'sale'],
  ]) {
    const objects = await fetchGarantiruemList(sectionPath);
    const minskObjects = objects.filter((o) => o.address?.includes('Минск'));

    const details = await mapWithConcurrency(minskObjects, 5, (o) => fetchGarantiruemObjectType(o.href));

    let matched = 0;
    for (let i = 0; i < minskObjects.length; i++) {
      const o = minskObjects[i];
      const { type, floor, district } = details[i];
      const mappedType = type ? GARANTIRUEM_TYPE_MAP[type] : null;
      if (mappedType !== propertyType) continue; // не наш тип, либо генерическое «Помещение»

      const size = Number(o.total_area);
      const priceUsd = Number(o.price?.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(priceUsd)) continue;
      const pricePerSqm = priceUsd / size;

      if (!isPlausiblePrice(dealType, pricePerSqm)) {
        excluded.push({ source: 'Garantiruem', dealType, size, pricePerSqm, adLink: `https://garantiruem.by${o.href}` });
        continue;
      }

      matched++;
      offers.push({
        source: 'Garantiruem',
        ad_id: `${dealType}-${o.id}`,
        deal_type: dealType,
        property_type: propertyType,
        building_type: null,
        size,
        price_per_sqm: pricePerSqm,
        floor,
        district,
        address: o.address,
        ad_link: `https://garantiruem.by${o.href}`,
      });
    }
    log?.(`Garantiruem (${sectionPath}): ${minskObjects.length} по Минску, из них ${propertyType} — ${matched}`);
  }
  return offers;
}

// ---------- Pro-N.by ----------
// Восьмой источник (2026-09-20) — из того же захода разведки: 645 лотов по
// Минску (404 аренда + 241 продажа), лучшая карточка из девяти проверенных
// площадок по полноте полей.
//
// Устройство ФУНДАМЕНТАЛЬНО другое, чем у всех прежних источников: у
// pro-n.by нет ни одной страницы, где можно легально долистать до конца.
// `robots.txt` разрешает `/rent/nonres/<id>/` (страница объявления) кому
// угодно, но явным правилом `Disallow: /*?*` запрещает ЛЮБОЙ query-параметр
// — а вся пагинация листинга живёт только через `?page=N&...`. Обходной
// путь, который САМ сайт публикует как легальный: `sitemap-objects.xml`
// перечисляет прямые URL объявлений без query — по нему и идём, вместо
// листинга. Плата за легальность — по объекту нужен отдельный GET (не
// пачка карточек одним запросом, как у прежних источников), и sitemap
// общий на всю Беларусь (632 аренда + 708 продажа), Минск внутри не
// выделен отдельно — фильтруем по факту, после открытия страницы.
//
// Тип помещения — из `<div class="obtt">Офис</div>` (то же значение
// повторяется полем `Назначение: Офис` рядом) — НАДЁЖНЕЕ, чем заголовок:
// категория «Помещения» (263 из 404 аренды, ПОЛОВИНА пула) — это
// генерический тип у самого источника, не наша недосмотренность, и мы его
// сознательно не разносим по сегментам (см. тот же принцип, что у
// Garantiruem выше — не угадываем, что за объект).
//
// Цена — ИЗ ВСТРОЕННОГО ПЕРЕСЧЁТА САМОЙ ПЛОЩАДКИ, не наш пересчёт по курсу:
// `onclick="calc(this,'27&nbsp;$ за м<sup>2</sup>|24&nbsp;€ за м<sup>2</sup>',...)"`
// — первое число после запуска этого атрибута — цена в долларах, которую
// сайт САМ считает по своему курсу (родное поле цены — BYN,
// `itemprop="priceCurrency" content="BYN"`, конвертировать самим — значит
// зависеть ещё и от того, какой курс на какую дату взять, а тут площадка
// уже сделала это за нас). Суффикс "за м2" внутри той же строки отличает
// цену за метр от цены за объект целиком — без этого суффикса делим сами.
//
// WAF (BitNinja) иногда отдаёт 403 на первый заход — лечится кукой с
// прошлого ответа плюс повтором (ниже — до 3 попыток).
const PRON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const PRON_TYPE_MAP = {
  Офис: 'Офисы',
  Торговое: 'Торговые помещения',
  // Значение в property_type у складского сегмента — 'Склады', не
  // 'Кладовые' (сверено с тем, что уже лежит в citywide_offers у
  // Kufar/Realt/Domovita/Megapolis для segment='sklady').
  Склад: 'Склады',
};

// Кука WAF (BitNinja) — общий файл на весь прогон, curl сам её ставит и
// перечитывает флагами -c/-b (та же кука, что получил один запрос,
// участвует в следующем — без этого печенья WAF держит 403 дольше).
let pronCookieJarPath = null;
async function getPronCookieJarPath() {
  if (pronCookieJarPath) return pronCookieJarPath;
  const os = await import('node:os');
  const path = await import('node:path');
  pronCookieJarPath = path.join(os.tmpdir(), `pro-n-cookies-${process.pid}.txt`);
  return pronCookieJarPath;
}

async function fetchProNWithRetry(url, attempts = 3) {
  const cookieJarPath = await getPronCookieJarPath();
  for (let i = 0; i < attempts; i++) {
    const res = await curlFetch(url, {
      headers: { 'User-Agent': PRON_UA, Accept: 'text/html', 'Accept-Language': 'ru' },
      cookieJarPath,
    });
    if (res.status === 403 && i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      continue;
    }
    return res;
  }
  throw new Error(`pro-n.by: ${url} — WAF не пропустил за ${attempts} попыток`);
}

// Кэш на диске (не в репозитории — системный temp), общий приём для
// Garantiruem и Pro-N: сегменты office/retail/warehouse вызывают сборщик
// по отдельности, каждый в своём процессе, а тип объекта решается только
// после открытия его страницы — независимо от того, какой сегмент сейчас
// спрашивает. Без кэша прогон трёх скриптов подряд обошёл бы ВЕСЬ список
// объектов площадки трижды (у Garantiruem — 204 детальных страницы, у
// Pro-N — около 1340). TTL короткий (3 часа) — это ускоритель ручного
// прогона нескольких сегментов подряд в одной сессии, не замена месячному
// крону (там сегменты и так идут в разных GitHub Actions джобах без
// общего диска, кэш там ни разу не выстрелит и не должен).
async function loadDiskCache(cacheKey) {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const file = path.join(os.tmpdir(), `citywide-extra-sources-${cacheKey}.json`);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < 3 * 60 * 60 * 1000) {
      return { file, data: JSON.parse(await fs.readFile(file, 'utf8')) };
    }
  } catch {
    // нет файла или истёк — просто ползём с нуля
  }
  return { file, data: null };
}

async function saveDiskCache(file, data) {
  const fs = await import('node:fs/promises');
  await fs.writeFile(file, JSON.stringify(data));
}

function parseProNSitemap(xml) {
  const ids = [];
  for (const m of xml.matchAll(/<loc>https:\/\/pro-n\.by\/(rent|sale)\/nonres\/(\d+)\/<\/loc>/g)) {
    ids.push({ dealType: m[1] === 'rent' ? 'rent' : 'sale', id: m[2] });
  }
  return ids;
}

function parseProNObjectPage(html) {
  const type = html.match(/<div class="obtt">([^<]+)<\/div>/)?.[1]?.trim() ?? null;
  const addrMatch = html.match(/<div class="obta">\s*<a[^>]*>([^<]+)<\/a>,\s*<a[^>]*>([^<]+)<\/a>,\s*([^<]+)<\/div>/);
  const city = addrMatch?.[1]?.trim() ?? null;
  const street = addrMatch?.[2]?.trim() ?? null;
  const house = addrMatch?.[3]?.trim() ?? null;
  const district = html.match(/<div class="obta2">\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null;
  // Площадь диапазоном ("90 - 370 м²", несколько помещений сразу под одним
  // объявлением) — единственную площадь не определить, не гадаем: если
  // сразу за первым числом идёт дефис перед вторым, размер уходит в NaN и
  // строка отсеивается ниже (`!Number.isFinite(row.size)`).
  const areaMatch = html.match(/Площадь помещений:\s*([\d.,]+)(\s*-\s*[\d.,]+)?(?:&nbsp;)?м/);
  const size = areaMatch && !areaMatch[2] ? Number(areaMatch[1].replace(',', '.')) : NaN;
  const floor = html.match(/Этаж\(и\)\/этажность:\s*(\d+)\/\d+/)?.[1] ?? null;
  // Разряды тысяч разделены тем же "&nbsp;", что и число от знака валюты —
  // "108&nbsp;817&nbsp;$" (108 817 $). Первая попытка регулярки ловила
  // только числа до 999: `[\d\s]+` не матчит буквы внутри "&nbsp;", и на
  // разделителе разрядов разбор молча обрывался, priceUsd уходил в null.
  // Проверено на живых карточках: из этого падало 66 из 159 минских
  // офисов — почти все продажи (там суммы за объект четырёх- и
  // пятизначные) и часть дорогой аренды.
  const calc = html.match(/calc\(this,'([\d]+(?:&nbsp;[\d]+)*)&nbsp;\$( за м(?:<sup>2<\/sup>)?)?/);
  const priceUsd = calc ? Number(calc[1].replace(/&nbsp;/g, '')) : null;
  const isPerSqm = Boolean(calc?.[2]);

  return { type, city, street, house, district, size, floor: floor ? Number(floor) : null, priceUsd, isPerSqm };
}

async function crawlProNAll(log) {
  const { file, data: cached } = await loadDiskCache('pro-n');
  if (cached) {
    log?.(`pro-n.by: беру из кэша сессии (${cached.length} объектов, моложе 3 часов)`);
    return cached;
  }

  const sitemapRes = await fetchProNWithRetry('https://pro-n.by/sitemap-objects.xml');
  if (!sitemapRes.ok) throw new Error(`pro-n.by sitemap вернул ${sitemapRes.status}`);
  const ids = parseProNSitemap(await sitemapRes.text());
  log?.(`pro-n.by: sitemap отдал ${ids.length} объявлений по всей Беларуси, открываю каждое...`);

  // Параллелизм ниже, чем у Garantiruem (4 вместо 5): все воркеры пишут
  // в ОДИН файл-куку WAF (см. getPronCookieJarPath) — curl не гарантирует
  // атомарность параллельной записи, слишком большой параллелизм рискует
  // терять куку. 403 всё равно ловит повтор (fetchProNWithRetry), но
  // лучше пореже в него попадать.
  const rows = await mapWithConcurrency(ids, 4, async ({ dealType, id }) => {
    try {
      const res = await fetchProNWithRetry(`https://pro-n.by/${dealType}/nonres/${id}/`);
      if (!res.ok) return null;
      const parsed = parseProNObjectPage(await res.text());
      return { ...parsed, dealType, id };
    } catch {
      return null; // одна неудачная страница не должна ронять весь прогон на 1300+ страниц
    }
  });

  const rowsClean = rows.filter(Boolean);
  await saveDiskCache(file, rowsClean);
  return rowsClean;
}

export async function collectProNOffers({ propertyType, isPlausiblePrice, excluded, log }) {
  const rows = await crawlProNAll(log);
  const offers = [];

  for (const row of rows) {
    if (row.city !== 'г. Минск' && row.city !== 'Минск') continue;
    const mappedType = row.type ? PRON_TYPE_MAP[row.type] : null;
    if (mappedType !== propertyType) continue;
    if (!row.street || !row.house) continue;
    if (!Number.isFinite(row.size) || row.size <= 0 || row.priceUsd == null) continue;

    const pricePerSqm = row.isPerSqm ? row.priceUsd : row.priceUsd / row.size;
    const address = `${row.street}, ${row.house}, Минск`;
    const adLink = `https://pro-n.by/${row.dealType}/nonres/${row.id}/`;

    if (!isPlausiblePrice(row.dealType, pricePerSqm)) {
      excluded.push({ source: 'Pro-N', dealType: row.dealType, size: row.size, pricePerSqm, adLink });
      continue;
    }

    offers.push({
      source: 'Pro-N',
      ad_id: `${row.dealType}-${row.id}`,
      deal_type: row.dealType,
      property_type: propertyType,
      building_type: null,
      size: row.size,
      price_per_sqm: pricePerSqm,
      floor: row.floor,
      district: row.district,
      address,
      ad_link: adLink,
    });
  }
  log?.(`pro-n.by: по Минску и типу «${propertyType}» — ${offers.length} годных объявлений`);
  return offers;
}
