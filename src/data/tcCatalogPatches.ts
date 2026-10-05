// Патчи каталога ТЦ поверх строк Supabase.
// 2026-10-04 — финализация списка; 2026-10-05 — открытие 4 скрытых с обложками
// (radzivillovskiy, schaste, sudmalisa-1g, very-horuzhey-25). SQL-зеркало:
// supabase/migrations/20261005-tc-unhide-four.sql.
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

  // --- открытие 4 скрытых ТЦ с обложками (2026-10-05) ---
  radzivillovskiy: {
    district: 'Центральный',
    totalArea: 8612,
    yearBuilt: 2003,
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
    floors: 3,
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
          category: 'красота',
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
          text: 'Магазин низких цен; в части каталогов указан адрес Судмалиса, 1Б рядом с 1Г.',
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
          text: 'Зоомагазин в торговом узле у метро «Пролетарская».',
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
  'green-na-uborevicha',
  'green-na-partizanskom',
  'komarovskiy-rynok',
  'kupets',
  'kurasovschinskiy-rynok',
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
  'radzivillovskiy',
  'ramonak',
  'schaste',
  'sudmalisa-1g',
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
  if (patch?.totalArea != null && out.total_area == null) out.total_area = patch.totalArea;
  if (patch?.floors != null && out.floors == null) out.floors = patch.floors;
  if (patch?.yearBuilt != null && out.year_built == null) out.year_built = patch.yearBuilt;
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
