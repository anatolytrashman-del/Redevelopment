// Техзадание для инженера, который считает смету ремонта — привязано к
// существующему объекту (RealtyObject), переиспользует его технический
// паспорт (BuildingSpecs) и интерактивные планировки (buildingPlanIds — тот
// же зумируемый план с этажами и кабинетами, что видит клиент на продающей
// странице и админ в карточке объекта, см. BriefBuildingPlans.tsx).
// Публикуется по share_token на /tz/:token — сам документ не требует пароля
// админки, его смотрит внешний инженер.

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

// Референс фасада — обычно AI-рендер, не фото реального объекта: подпись
// поверх фото, чтобы сметчик не принял его за фотографию готового здания.
export const FACADE_REFERENCE_CAPTION = 'Примерный дизайн, созданный искусственным интеллектом согласно ТЗ';

// Строка над блоком планировок — план объекта в базе не всегда чертёжного
// качества (со размерами), а для сметы это важно. Просто напоминание
// сметчику, что точный техплан заказан у собственника отдельно, а
// показанная ниже планировка — рабочий вариант для ориентира.
export const PLAN_REQUEST_NOTE = 'Запрошен техплан у собственника с планировками и размерами в хорошем разрешении';

// Точка-комментарий на фото "до" — x/y в процентах от размера фото (не в
// пикселях: тогда отметка съезжала бы при показе фото в другом размере,
// например в модалке редактирования и на публичной странице). Все контейнеры,
// где фото с точками показывается в реальном размере (не миниатюра без
// разметки), обязаны использовать один и тот же aspect-[16/9] — иначе
// object-cover кадрирует фото по-разному и точки визуально съезжают
// (см. AnnotatedPhoto.tsx/PinnedPhotoCarousel.tsx).
export interface PhotoPin {
  id: string;
  x: number;
  y: number;
  comment: string;
  // Референс на конкретную модель/товар ("вот такую именно дверь
  // поставить") — необязательный, отдельно от текстового комментария.
  // На публичной странице не показывается сразу картинкой (загораживала
  // фото), а скрыт за ссылкой "Референс" — см. ReferencePopup.tsx.
  referenceImageUrl: string;
  referenceDescription: string;
  referenceUrl: string;
}

export function pinHasReference(pin: Pick<PhotoPin, 'referenceImageUrl' | 'referenceDescription' | 'referenceUrl'>): boolean {
  return !!(pin.referenceImageUrl || pin.referenceDescription || pin.referenceUrl);
}

export interface BriefCategoryPhotos {
  beforeUrls: string[];
  afterUrls: string[];
  // Отметки бывают и у фото "до", и у фото "после" — ключ: url фото (не
  // индекс в массиве: индекс сползает при удалении фото, а url общий для
  // обоих списков, что и позволяет копировать точки между "до" и "после",
  // см. copyPins в BriefFormModal.tsx). Список комментариев показывается
  // сбоку от фото, пронумерован в тон меткам на самом фото.
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

// Достраивает недостающие категории/поля до полной структуры — приходит
// из безопасности из БД: старые строки (созданные до того, как появилось
// это поле) получили photos = {} от значения по умолчанию колонки, без
// ключей facade/offices/commonAreas внутри. row.photos ?? emptyBriefPhotos()
// такое не ловит, потому что {} — не null/undefined.
export function normalizeBriefPhotos(raw: Partial<BriefPhotos> | null | undefined): BriefPhotos {
  const result = {} as BriefPhotos;
  for (const category of briefPhotoCategories) {
    const c = raw?.[category];
    const pins: Record<string, PhotoPin[]> = {};
    for (const [url, list] of Object.entries(c?.pins ?? {})) {
      pins[url] = (list ?? []).map((p) => ({
        ...p,
        referenceImageUrl: p.referenceImageUrl ?? '',
        referenceDescription: p.referenceDescription ?? '',
        referenceUrl: p.referenceUrl ?? '',
      }));
    }
    result[category] = {
      beforeUrls: c?.beforeUrls ?? [],
      afterUrls: c?.afterUrls ?? [],
      pins,
    };
  }
  return result;
}

export interface Brief {
  id: string;
  objectId: string;
  // Кому направлено техзадание — имя и телефон подставляются из базы
  // подрядчиков при выборе, но остаются обычными полями формы: можно
  // вписать вручную человека, которого ещё нет в базе.
  recipientName: string;
  recipientPhone: string;
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
  recipient_name: string | null;
  recipient_phone: string | null;
  photos: BriefPhotos | null;
  share_token: string;
  created_at: string;
}
