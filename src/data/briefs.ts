// Техзадание для инженера, который считает смету ремонта — привязано к
// существующему объекту (RealtyObject), переиспользует его планировки и
// технический паспорт (BuildingSpecs), а не дублирует их. Публикуется по
// share_token на /tz/:token — сам документ не требует пароля админки, его
// смотрит внешний инженер.

// Три вида, по которым разложены фото "до"/"после" — у здания и кабинетов, и
// общих зон, и фасада разная логика ремонта, инженеру удобнее смотреть их
// не одной кучей.
export const briefPhotoCategories = ['facade', 'offices', 'commonAreas'] as const;
export type BriefPhotoCategory = (typeof briefPhotoCategories)[number];

export const briefPhotoCategoryLabels: Record<BriefPhotoCategory, string> = {
  facade: 'Фасад',
  offices: 'Кабинеты',
  commonAreas: 'Общие зоны',
};

// Точка-комментарий на фото "до" — x/y в процентах от размера фото (не в
// пикселях: тогда отметка съезжала бы при показе фото в другом размере,
// например в модалке редактирования и на публичной странице).
export interface PhotoPin {
  id: string;
  x: number;
  y: number;
  comment: string;
}

export interface BriefCategoryPhotos {
  beforeUrls: string[];
  afterUrls: string[];
  // Отметки только у фото "до" — ключ: url фото (не индекс в массиве: индекс
  // сползает при удалении фото). Список комментариев показывается сбоку от
  // фото, пронумерован в тон меткам на самом фото.
  pins: Record<string, PhotoPin[]>;
}

export type BriefPhotos = Record<BriefPhotoCategory, BriefCategoryPhotos>;

export function emptyCategoryPhotos(): BriefCategoryPhotos {
  return { beforeUrls: [], afterUrls: [], pins: {} };
}

export function emptyBriefPhotos(): BriefPhotos {
  return {
    facade: emptyCategoryPhotos(),
    offices: emptyCategoryPhotos(),
    commonAreas: emptyCategoryPhotos(),
  };
}

export interface Brief {
  id: string;
  objectId: string;
  photos: BriefPhotos;
  shareToken: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/briefsApi.ts.
// photos хранится единым JSONB-полем (тот же приём, что building_specs у
// объекта): вложенная структура категория→до/после/пины, разбивать на
// отдельные колонки под каждую категорию неудобно и негибко.
export interface BriefRow {
  id: string;
  object_id: string;
  photos: BriefPhotos | null;
  share_token: string;
  created_at: string;
}
