// Переезд каталога БЦ с /minsk/bcminsk на /minsk/bc (2026-09-23): старый путь
// → новый. Нужен сборке, а не браузеру: страницы вне раздела в быстром и
// аварийном режимах пререндера копируются с прода вместе с шапкой и
// ссылками на каталог, и без переписи в их HTML остались бы ссылки через
// 301. Схема — та же, что у 301-редиректов в vercel.json (правишь одно —
// правь и другое; сверяет scripts/legacyCatalogUrls.test.js).

// Улицы: «ul-» отброшен, «pr-t-»/«per-» — полным словом.
export const LEGACY_STREET_SLUGS = {
  'pr-t-pobediteley': 'prospekt-pobediteley',
  'pr-t-nezavisimosti': 'prospekt-nezavisimosti',
  'pr-t-dzerzhinskogo': 'prospekt-dzerzhinskogo',
  'ul-pritytskogo': 'pritytskogo',
  'ul-surganova': 'surganova',
  'ul-platonova': 'platonova',
  'ul-klary-tsetkin': 'klary-tsetkin',
  'per-kozlova': 'pereulok-kozlova',
  'pr-t-partizanskiy': 'prospekt-partizanskiy',
  'ul-horuzhey': 'horuzhey',
  'ul-filimonova': 'filimonova',
  'ul-nemiga': 'nemiga',
  'ul-melezha': 'melezha',
  'ul-tolbuhina': 'tolbuhina',
  'ul-zheleznodorozhnaya': 'zheleznodorozhnaya',
  'ul-internatsionalnaya': 'internatsionalnaya',
  'ul-lobanka': 'lobanka',
  'ul-olshevskogo': 'olshevskogo',
  'ul-sverdlova': 'sverdlova',
  'ul-skryganova': 'skryganova',
  'ul-timiryazeva': 'timiryazeva',
  'ul-skoriny': 'skoriny',
};

// Старые алиасы-«микрорайоны», которые и раньше редиректили в другие хабы.
const LEGACY_AREA_ALIASES = {
  grushevka: 'metro/grushevka',
  uruchye: 'metro/uruchye',
  'kamennaya-gorka': 'metro/kamennaya-gorka',
  suharevo: 'street/lobanka',
};

// Карточки, слитые в другую (2026-09-24: «Порт» на Шафарнянской, 11 стал
// корпусом общей карточки «Порт»). Старый адрес ведёт сразу на итоговый —
// и из /minsk/bcminsk, и из /minsk/bc (оба 301 в vercel.json).
export const MERGED_BC_SLUGS = {
  'port-2': 'port',
};

const RATING_SLUGS = {
  'samye-dostupnye': 'affordable',
  'samye-bolshie': 'largest',
  'b-plus': 'class-b-plus',
  'b-c': 'class-b-c',
};

/** Хвост старого пути (сегменты после /minsk/bcminsk) → новый путь целиком. */
export function newCatalogPath(segments) {
  const s = segments.filter(Boolean);
  const tail = (() => {
    if (s.length === 0) return [];
    if (s.length === 1 && s[0] === 'reyting') return ['rating'];
    if (s.length === 1 && s[0] === 'stroyashchiesya') return ['new'];
    if (s.length === 1 && s[0] === 'gid') return ['guide'];
    if (s.length === 1 && MERGED_BC_SLUGS[s[0]]) return [MERGED_BC_SLUGS[s[0]]];
    if (s.length === 2 && s[0] === 'rating') return ['rating', RATING_SLUGS[s[1]] ?? s[1]];
    if (s.length === 2 && s[0] === 'raion') return ['district', s[1]];
    if (s.length === 4 && s[0] === 'class' && s[2] === 'raion') return ['class', s[1], 'district', s[3]];
    if (s.length === 2 && s[0] === 'microrayon') return LEGACY_AREA_ALIASES[s[1]]?.split('/') ?? ['area', s[1]];
    if (s.length === 2 && s[0] === 'ulitsa') return ['street', LEGACY_STREET_SLUGS[s[1]] ?? s[1]];
    return s;
  })();
  return ['/minsk/bc', ...tail].join('/');
}

// /minsk/bcminsk и хвост из сегментов-слагов; конец — любой символ, который
// не может продолжать путь (кавычка, «?», «#», «<», пробел, конец строки).
const LEGACY_PATH_RE = /\/minsk\/bcminsk((?:\/[a-z0-9-]+)*)\/?(?![a-z0-9-])/g;

/** Переписывает в HTML все ссылки на старые адреса каталога на новые. */
export function rewriteLegacyCatalogUrls(html) {
  return html.replace(LEGACY_PATH_RE, (_m, tail) => newCatalogPath(tail.split('/')));
}
