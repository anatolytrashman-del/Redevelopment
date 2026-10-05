// Патчи каталога ТЦ поверх строк Supabase.
// 2026-10-04 — финализация списка; 2026-10-05 — открытие 4 скрытых с обложками
// (radzivillovskiy, schaste, sudmalisa-1g, very-horuzhey-25); уточнения ресерча —
// supabase/migrations/20261005-tc-four-research-corrections.sql;
// добор тонких (globus-park, pole-chudes, lobanka-26, stepyanka, talisman-tc) —
// supabase/migrations/20261005-tc-eight-research-fill.sql.
//
// Остальные скрытые ТЦ (is_hidden): без обложки — оставляем скрытыми.

import type { BusinessCenter, NearestMetroStation, RetailInfo } from './businessCenters';
import { normalizeRetailInfo } from '../lib/tradeCenterRetail';

export interface TcCatalogPatch {
  district?: string;
  totalArea?: number;
  floors?: number;
  yearBuilt?: number;
  retailFormat?: string;
  /** Локальный путь обложки после localize-tc-storage-photos. */
  photo?: string;
  nearestMetroStations?: NearestMetroStation[];
  metro?: string;
  /** Частичный retail_info: непустые поля патча дополняют пустые в базе. */
  retailInfo?: Partial<RetailInfo>;
}

/** Единичные «шумные» форматы → канон фильтра. Аутлет не трогаем (отдельный хаб). */
export const TC_FORMAT_ALIASES: Record<string, string> = {
  'МФК с офисами и торговыми помещениями': 'ТЦ',
  'одноэтажный торговый центр': 'ТЦ',
  'торговая часть бывшего универсама': 'районный ТЦ',
  'строительный гипермаркет': 'строительный центр',
  'торговый комплекс': 'ТЦ',
  'бывший торговый центр': 'районный ТЦ',
  'магазин «Мила»; отдельный ТЦ не подтверждён': 'районный ТЦ',
};

export const TC_CATALOG_PATCHES: Record<string, TcCatalogPatch> = {
  // --- районы (пустые на проде) ---
  stolitsa: { district: 'Центральный' },
  'univermag-belarus': { district: 'Заводской' },
  zhdanovichi: { district: 'Фрунзенский', totalArea: 39000 },
  tsum: { district: 'Советский' },
  gum: { district: 'Центральный' },
  'avtomoll-koltso': { district: 'Московский' },

  // --- площадь у ядра / уверенные цифры из описания ---
  'metropol-tc': { totalArea: 28000 },
  'green-na-partizanskom': { totalArea: 20300 },
  'gippo-na-goretskogo': { totalArea: 16773 },
  'nova-mall': { totalArea: 5722 },
  ocean: { floors: 3 },

  // --- метро: только ≤1500 м ---
  'diamond-city': {
    nearestMetroStations: [
      { name: 'Малиновка', distanceMeters: 1230, line: 'Московская линия', color: '#0064AF' },
    ],
    metro: '«Малиновка», ~1,2 км',
  },

  // --- форматы ---
  'nord-siti-tc': { retailFormat: 'ТЦ' },
  'all-house': { retailFormat: 'ТЦ' },
  'mayakovskogo-146': { retailFormat: 'районный ТЦ' },
  'oma-shabany': { retailFormat: 'строительный центр' },
  'vitalyur-na-rafieva': { retailFormat: 'ТЦ' },

  // --- открытие 4 скрытых ТЦ + правки ресерча (2026-10-05) ---
  radzivillovskiy: {
    district: 'Центральный',
    totalArea: 8612,
    yearBuilt: 1986,
    floors: 3,
    retailFormat: 'районный ТЦ',
    retailInfo: {
      hours: [
        {
          zone: 'Супермаркет «Санта»',
          value: 'ежедневно 09:00–23:00',
          note: null,
          source: 'Onliner / 2ГИС',
          sourceUrl: 'https://money.onliner.by/2024/11/03/magazin-v-vesnyanke',
        },
      ],
      parking: {
        summary:
          'Наземная бесплатная парковка у дома; оценка 2ГИС ≈20 и ≈24 места. Цифра «более 1000» из отраслевого справочника относится к сети, не к этой площадке.',
        items: [
          { label: 'У здания', value: '≈20 мест, бесплатно' },
          { label: 'Доп. у здания', value: '≈24 места, бесплатно' },
        ],
        date: '2026',
        source: '2ГИС',
        sourceUrl: 'https://2gis.by/minsk/geo/70030076196221465',
      },
      transport: [
        {
          mode: 'bus',
          text: 'Остановка «Леси Украинки» / «Веснянка»: автобусы 73, 130, 151с, 190э; троллейбусы 14, 58.',
          source: 'Расписание транспорта Минска',
          sourceUrl: 'https://minsk.btrans.by/ostanovka/lesi-ukrainki',
        },
      ],
    },
  },
  schaste: {
    district: 'Первомайский',
    totalArea: 1997,
    yearBuilt: 1979,
    floors: 2,
    retailFormat: 'районный ТЦ',
    retailInfo: {
      hours: [
        {
          zone: 'Супермаркет «Санта»',
          value: 'ежедневно 09:00–23:00',
          note: 'площадь супермаркета ~500 м²',
          source: 'Belretail',
          sourceUrl: 'https://belretail.by/news/na-meste-tts-schaste-v-minske-otkryilsya-supermarket-santa',
        },
      ],
    },
  },
  'sudmalisa-1g': {
    district: 'Ленинский',
    yearBuilt: 2021,
    floors: 1,
    metro: '«Пролетарская», ~90 м',
    nearestMetroStations: [
      { name: 'Пролетарская', distanceMeters: 90, line: 'Автозаводская линия', color: '#E90101' },
      { name: 'Первомайская', distanceMeters: 1100, line: 'Автозаводская линия', color: '#E90101' },
    ],
    retailFormat: 'районный ТЦ',
    retailInfo: {
      hours: [
        {
          zone: '«Мила»',
          value: 'ежедневно 09:00–21:00',
          note: null,
          source: 'Pakupnik / сеть «Мила»',
          sourceUrl: 'https://pakupnik.by/mila/shops/13641/',
        },
      ],
      anchors: [
        {
          name: 'Мила',
          category: 'другое',
          floor: null,
          area: null,
          since: null,
          text: 'Магазин косметики и бытовой химии сети «Мила».',
          yandexUrl: 'https://yandex.by/maps/org/mila/223223256356/',
          source: 'Отраслевой справочник; Яндекс Карты',
          sourceUrl: 'https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html',
        },
        {
          name: 'Три цены',
          category: 'дом и интерьер',
          floor: '1',
          area: null,
          since: null,
          text: 'Магазин низких цен по адресу Судмалиса, 1Б (соседний корпус, не 1Г).',
          yandexUrl: null,
          source: 'Отраслевой справочник; 2ГИС',
          sourceUrl: 'https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html',
        },
        {
          name: 'Zooбазар',
          category: 'другое',
          floor: null,
          area: null,
          since: null,
          text: 'Зоомагазин по адресу Судмалиса, 1В (соседний корпус, не 1Г).',
          yandexUrl: null,
          source: 'Отраслевой справочник',
          sourceUrl: 'https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html',
        },
      ],
    },
  },
  'very-horuzhey-25': {
    district: 'Советский',
    totalArea: 3700,
    yearBuilt: 1978,
    floors: 4,
    retailFormat: 'районный ТЦ',
    retailInfo: {
      transport: [
        {
          mode: 'bus',
          text: 'Остановка «Веры Хоружей»: автобусы 19, 25, 29, 46.',
          source: 'minsk.btrans.by',
          sourceUrl: 'https://minsk.btrans.by/ostanovka/very-horuzhej',
        },
        {
          mode: 'trolleybus',
          text: 'Остановка «Веры Хоружей»: троллейбусы 22, 37, 40, 40а, 46, 53.',
          source: 'minsk.btrans.by',
          sourceUrl: 'https://minsk.btrans.by/ostanovka/very-horuzhej',
        },
        {
          mode: 'walk',
          text: 'Ближайшие действующие станции метро дальше 1,5 км (Яндекс: «Площадь Якуба Коласа» ≈1,8 км). На сайте центра заявлены будущие «Комаровская» и «Парк Дружбы Народов».',
          source: 'Яндекс Карты; discounterminsk.by',
          sourceUrl: 'https://yandex.by/maps/org/diskaunter/71375222166/',
        },
      ],
    },
  },

  // --- добор тонких после открытия 8 с обложками (2026-10-05) ---
  // green-time / korona-siti / kupalovskiy — ресерч уже полный (только фото+unhide).
  'globus-park': {
    totalArea: 24247,
    yearBuilt: 2015,
    retailFormat: 'ТЦ',
    retailInfo: {
      hours: [
        {
          zone: 'Торговый центр',
          value: 'ежедневно 09:00–22:00',
          note: 'по справочникам; отдельные операторы могут отличаться',
          source: 'dir.by / dosug.by',
          sourceUrl: 'https://dir.by/belarus/minskaya_oblast/globus_park/',
        },
      ],
      parking: {
        summary: 'Парковка торгового центра — 1 500 машиномест (официальный сайт).',
        items: [{ label: 'Мест', value: '1 500' }],
        date: '2026',
        source: 'Сайт комплекса',
        sourceUrl: 'https://globuspark.com/about/',
      },
      anchors: [
        {
          name: 'OZ.by',
          category: 'другое',
          floor: null,
          area: null,
          since: null,
          text: 'Пункт выдачи интернет-магазина OZ.by.',
          yandexUrl: null,
          source: 'Сайт комплекса',
          sourceUrl: 'https://globuspark.com/category/arendatori/',
        },
        {
          name: 'MEGATOP',
          category: 'fashion',
          floor: null,
          area: null,
          since: null,
          text: 'Сеть магазинов обуви.',
          yandexUrl: null,
          source: 'Сайт комплекса',
          sourceUrl: 'https://globuspark.com/category/arendatori/',
        },
        {
          name: 'Мой',
          category: 'дом и интерьер',
          floor: null,
          area: null,
          since: null,
          text: 'Магазин бытовой химии и товаров для дома (Cash and Carry).',
          yandexUrl: null,
          source: 'Сайт комплекса',
          sourceUrl: 'https://globuspark.com/category/arendatori/',
        },
        {
          name: 'DOMO техника',
          category: 'электроника',
          floor: null,
          area: null,
          since: null,
          text: 'Дистрибьютор бытовой техники / пункт выдачи.',
          yandexUrl: null,
          source: 'Сайт комплекса',
          sourceUrl: 'https://globuspark.com/category/arendatori/',
        },
      ],
      transport: [
        {
          mode: 'car',
          text: 'Агрогородок Щомыслица, около 3 км от МКАД по трассе Р1 (Минск — Брест).',
          source: 'Сайт комплекса',
          sourceUrl: 'https://globuspark.com/',
        },
      ],
      factCards: [
        {
          headline: 'Торгово-логистический комплекс',
          text: 'Кроме галереи — склады класса A (22 тыс. м²), офисы и пункт таможенного декларирования.',
        },
        {
          headline: 'GLA около 24 тыс. м²',
          text: 'Официальные цифры: GBA 31 934 м², GLA 24 247 м², парковка на 1 500 мест.',
        },
      ],
    },
  },
  'pole-chudes': {
    retailInfo: {
      anchors: [
        {
          name: 'Блошиный рынок',
          category: 'другое',
          floor: null,
          area: null,
          since: null,
          text: 'Единственный в Минске рынок подержанных товаров на территории ТГ «Ждановичи».',
          yandexUrl: 'https://yandex.by/maps/org/pole_chudes/131608552826/',
          source: 'ТГ «Ждановичи»; Megapolis',
          sourceUrl: 'https://zhdanovichi.by/area/rynok-pole-chudes',
        },
      ],
    },
  },
  'lobanka-26': {
    yearBuilt: 2008,
    retailInfo: {
      hours: [
        {
          zone: '«Соседи Экспресс»',
          value: 'ежедневно 07:00–23:00',
          note: null,
          source: 'Pakupnik / сеть «Соседи»',
          sourceUrl: 'https://pakupnik.by/sosedi/shops/15517/',
        },
        {
          zone: '«Точка»',
          value: 'пн–чт 11:00–23:00, пт 11:00–00:00, сб–вс 10:00–00:00',
          note: null,
          source: 'tochca.by / каталоги',
          sourceUrl: 'https://your.beer/place/tochka-lobanka/about',
        },
      ],
      parking: {
        summary: 'У адреса ул. Лобанка, 26 указана круглосуточная парковка.',
        items: [
          { label: 'Режим', value: 'круглосуточно' },
          { label: 'Тип', value: 'у здания' },
        ],
        date: '2026',
        source: 'Справочники',
        sourceUrl: 'https://minsk.jsprav.ru/avtostoyanki-parkingi/parkovka-413/',
      },
      anchors: [
        {
          name: 'Соседи Экспресс',
          category: 'гипермаркет',
          floor: '1',
          area: null,
          since: null,
          text: 'Супермаркет сети «Соседи» — продуктовый якорь здания.',
          yandexUrl: null,
          source: '2ГИС / Pakupnik',
          sourceUrl: 'https://2gis.by/minsk/firm/70000001083500482',
        },
        {
          name: 'Зообазар',
          category: 'другое',
          floor: '1',
          area: null,
          since: null,
          text: 'Зоомагазин Zoobazar с ветеринарной аптекой.',
          yandexUrl: null,
          source: 'Отраслевой справочник',
          sourceUrl: 'https://megapolis-real.by/torgovyie-czentryi/lobanka-26.html',
        },
        {
          name: 'Точка',
          category: 'другое',
          floor: '1',
          area: null,
          since: null,
          text: 'Магазин разливного пива сети «Точка».',
          yandexUrl: null,
          source: 'Яндекс / tochca.by',
          sourceUrl: 'https://your.beer/place/tochka-lobanka/about',
        },
      ],
      factCards: [
        {
          headline: 'Якорь — «Соседи Экспресс»',
          text: 'Супермаркет сети работает ежедневно с 7:00 до 23:00; рядом Zoobazar, «Точка», пекарня и кафе.',
        },
        {
          headline: 'У метро «Каменная горка»',
          text: 'Около 800 м пешком до станции.',
        },
      ],
    },
  },
  stepyanka: {
    retailInfo: {
      parking: {
        summary: 'Рядом с ТЦ указана автомобильная парковка по адресу Карвата, 4/2, круглосуточно.',
        items: [
          { label: 'Адрес стоянки', value: 'ул. Карвата, 4/2' },
          { label: 'Режим', value: 'круглосуточно' },
        ],
        date: '2026',
        source: 'Справочники',
        sourceUrl: 'https://minsk.jsprav.ru/avtostoyanki-parkingi/avtomobilnaia-parkovka-1237/',
      },
      factCards: [
        {
          headline: 'Районный ТЦ 2004 года',
          text: 'Построен в 2004-м в микрорайоне Степянка (Партизанский район).',
        },
        {
          headline: 'Якорь Fix Price',
          text: 'Среди арендаторов — Fix Price, кафе Kebab Town, «Рыбка моя» и ателье.',
        },
        {
          headline: 'Часы галереи',
          text: 'По справочникам центр работает ежедневно 9:00–20:00; магазины могут закрываться позже.',
        },
      ],
    },
  },
  'talisman-tc': {
    retailInfo: {
      factCards: [
        {
          headline: 'Супермаркет 658 м²',
          text: 'На 1 этаже — помещение под супермаркет 658,6 м² (план talisman.by); якорь — «Евроопт Market».',
        },
        {
          headline: '3 этажа + цоколь',
          text: 'Цоколь — услуги и склады; 2–3 этажи — торговые и сервисные помещения группы TALISMAN.',
        },
        {
          headline: 'Группа TALISMAN',
          text: 'Второй объект группы — бизнес-центр на ул. Чапаева, 4А (2021).',
        },
      ],
    },
  },

  // --- тонкие карточки без повторного Яндекса ---
  'evropa-tc': {
    retailInfo: {
      hours: [
        {
          zone: 'Торговая галерея',
          value: 'ежедневно 10:00–21:00',
          note: 'как у корпуса «Новая Европа» того же комплекса',
          source: 'ТЦ «Европа» / «Новая Европа»',
          sourceUrl: null,
        },
      ],
      parking: {
        summary:
          'Подземный паркинг (платный) и наземная бесплатная парковка у комплекса «Европа» / «Новая Европа».',
        items: [
          { label: 'Наземная парковка', value: 'бесплатно' },
          { label: 'Подземный паркинг, первый час', value: 'ориентир 3,00 руб. (корпус «Новая Европа»)' },
        ],
        date: '2026-09',
        source: 'Карточка «Новая Европа» (тот же комплекс)',
        sourceUrl: null,
      },
    },
  },
  boro: {
    retailInfo: {
      anchors: [
        {
          name: 'Гиппо',
          category: 'гипермаркет',
          floor: null,
          area: null,
          since: null,
          text: 'Якорный оператор',
          yandexUrl: null,
          source: 'Яндекс.Карты / описание ТЦ',
          sourceUrl: null,
        },
        {
          name: '5 Элемент',
          category: 'электроника',
          floor: null,
          area: null,
          since: null,
          text: '',
          yandexUrl: null,
          source: 'Яндекс.Карты',
          sourceUrl: null,
        },
        {
          name: 'Удачник',
          category: 'другое',
          floor: null,
          area: null,
          since: null,
          text: '',
          yandexUrl: null,
          source: 'highlights карточки',
          sourceUrl: null,
        },
      ],
      hours: [
        {
          zone: 'Гиппо',
          value: 'ежедневно 09:00–23:00',
          note: null,
          source: 'highlights карточки',
          sourceUrl: null,
        },
      ],
      transport: [
        {
          mode: 'car',
          text: 'Деревня Боровая, ~1 км от МКАД по Логойскому тракту.',
          source: 'описание ТЦ',
          sourceUrl: null,
        },
      ],
    },
  },
};

/** Slug'и с обложкой из Supabase Storage, локализованной в репозиторий. */
export const TC_LOCALIZED_STORAGE_PHOTO_SLUGS = [
  'most-mogilevskaya',
  'nord-siti-tc',
  'aleksandrov-passazh-tc',
  'all-house',
  'asanalieva-44',
  'avtoindustriya',
  'avtomir',
  'avtozapchast',
  'chizhovskiy-rynok',
  'diana',
  'dmitriev-kirmash',
  'e-siti-goshkevicha',
  'gippo-na-igumenskom-trakte',
  'gippo-na-rokossovskogo',
  'gippo-na-goretskogo',
  'globus-park',
  'green-na-uborevicha',
  'green-na-partizanskom',
  'green-time',
  'komarovskiy-rynok',
  'korona-siti',
  'kupets',
  'kupalovskiy',
  'kurasovschinskiy-rynok',
  'lobanka-26',
  'lukyanovicha-4b',
  'magnit-suharevo',
  'makaenka-11',
  'nova-mall',
  'maksimus-suharevo',
  'mayakovskogo-146',
  'mazurova-24',
  'moskovsko-venskiy',
  'na-golodeda',
  'na-suharevskoy',
  'novyy-lebyazhiy',
  'oma-brilevichi',
  'oma-shabany',
  'pervomayskiy',
  'pole-chudes',
  'radzivillovskiy',
  'ramonak',
  'schaste',
  'stepyanka',
  'sudmalisa-1g',
  'talisman-tc',
  'tuteyshy',
  'serebryanka',
  'simax',
  'avtomoll-koltso',
  'uruche-3',
  'very-horuzhey-25',
  'viessmann',
  'vitalyur-na-rafieva',
  'zapadnyy-rynok',
  'zhinovicha-7',
] as const;

const LOCALIZED_SET = new Set<string>(TC_LOCALIZED_STORAGE_PHOTO_SLUGS);

export function localizedTcPhotoPath(slug: string): string {
  return `/images/business-centers/tc-${slug}.jpg`;
}

export function resolveTcRetailFormat(format: string | null | undefined): string | null {
  if (format == null || format === '') return null;
  return TC_FORMAT_ALIASES[format] ?? format;
}

function isEmptyRetailValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** Дополняет пустые поля retail_info патчем (непустые из базы сохраняются). */
export function mergeRetailInfoPatch(
  base: RetailInfo | null,
  patch: Partial<RetailInfo> | undefined,
): RetailInfo | null {
  if (!patch) return base;
  const normalizedPatch = normalizeRetailInfo(patch);
  if (!normalizedPatch) return base;
  if (!base) return normalizedPatch;
  const out: RetailInfo = { ...base };
  for (const key of Object.keys(normalizedPatch) as (keyof RetailInfo)[]) {
    const value = normalizedPatch[key];
    if (value == null) continue;
    if (isEmptyRetailValue(out[key])) {
      (out as unknown as Record<string, unknown>)[key as string] = value;
    }
  }
  return out;
}

/** Применяет патч каталога ТЦ к доменной модели после fromRow. */
export function applyTcCatalogPatch<T extends BusinessCenter>(center: T): T {
  if (center.kind !== 'tc') return center;
  const patch = TC_CATALOG_PATCHES[center.slug];
  const localizedPhoto = LOCALIZED_SET.has(center.slug) ? localizedTcPhotoPath(center.slug) : null;
  const nextPhotos =
    localizedPhoto &&
    center.photos.some((p) => p.includes('/object-photos/tc-catalog/') || p === localizedPhoto)
      ? [localizedPhoto]
      : center.photos;

  const format = resolveTcRetailFormat(patch?.retailFormat ?? center.retailFormat);

  return {
    ...center,
    district: patch?.district ?? center.district,
    totalArea: patch?.totalArea ?? center.totalArea,
    floors: patch?.floors ?? center.floors,
    yearBuilt: patch?.yearBuilt ?? center.yearBuilt,
    retailFormat: format,
    photos: nextPhotos.length ? nextPhotos : center.photos,
    nearestMetroStations:
      center.nearestMetroStations.length > 0
        ? center.nearestMetroStations
        : (patch?.nearestMetroStations ?? center.nearestMetroStations),
    metro: center.metro ?? patch?.metro ?? null,
    retailInfo: mergeRetailInfoPatch(center.retailInfo, patch?.retailInfo),
  };
}

/** Патч сырой строки списка/карточки до fromRow (сборка JSON). */
export function applyTcCatalogPatchToRow<T extends Record<string, unknown>>(row: T): T {
  if (row.kind !== 'tc' || typeof row.slug !== 'string') return row;
  const patch = TC_CATALOG_PATCHES[row.slug];
  const out: Record<string, unknown> = { ...row };
  if (patch?.district && !out.district) out.district = patch.district;
  if (patch?.totalArea != null) out.total_area = patch.totalArea;
  if (patch?.floors != null) out.floors = patch.floors;
  if (patch?.yearBuilt != null) out.year_built = patch.yearBuilt;
  if (patch?.metro && !out.metro) out.metro = patch.metro;
  const stations = out.nearest_metro_stations;
  if (patch?.nearestMetroStations && (!Array.isArray(stations) || stations.length === 0)) {
    out.nearest_metro_stations = patch.nearestMetroStations.map((s) => ({
      name: s.name,
      distanceMeters: s.distanceMeters,
      line: s.line,
      color: s.color,
    }));
  }
  const format = typeof out.retail_format === 'string' ? out.retail_format : null;
  out.retail_format = resolveTcRetailFormat(patch?.retailFormat ?? format);
  if (LOCALIZED_SET.has(row.slug)) {
    out.photos = [localizedTcPhotoPath(row.slug)];
  }
  if (patch?.retailInfo) {
    const base =
      out.retail_info && typeof out.retail_info === 'object' && !Array.isArray(out.retail_info)
        ? { ...(out.retail_info as Record<string, unknown>) }
        : {};
    for (const [key, value] of Object.entries(patch.retailInfo)) {
      if (value == null) continue;
      if (isEmptyRetailValue(base[key])) base[key] = value;
    }
    out.retail_info = base;
  }
  return out as T;
}
