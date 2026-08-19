export const demandSources = ['Kufar', 'Realt', 'Avito', 'Megapolis-real'] as const;
export type DemandSource = (typeof demandSources)[number];

export const contactChannels = ['Телефон', 'Telegram', 'WhatsApp', 'Email'] as const;
export type ContactChannel = (typeof contactChannels)[number];

// Открытый список, как pledgeTypes/contractorSpecialties — свой вариант
// добавляется прямо из формы. Показывается бейджем на превью карточки,
// тот же приём, что и Pledge.propertyType.
export const objectStatuses = ['Деловой центр', 'Склад'] as const;

export interface DemandLink {
  source: DemandSource;
  url: string;
}

// Технический паспорт здания — необязательный блок, заполняется отдельно
// от основной формы объекта (см. BuildingSpecsModal). Числовые поля — null,
// если значение неизвестно; хранится единым JSONB-полем, поэтому ключи здесь
// совпадают с тем, что лежит в building_specs один-в-один (без snake_case).
export interface BuildingSpecs {
  buildingName: string;
  buildingPurpose: string;
  yearBuilt: number | null;
  yearRenovated: number | null;
  floorsCount: number | null;
  totalArea: number | null;
  normativeArea: number | null;
  roomsCount: number | null;
  officesCount: number | null;
  bathroomsCount: number | null;
  otherRooms: string;
  foundation: string;
  walls: string;
  ceilings: string;
  structure: string;
  roof: string;
  flooring: string;
  windows: string;
  phone: string;
  electricity: string;
  water: string;
  sewerage: string;
  heating: string;
  landArea: number | null;
  landPurpose: string;
}

export const emptyBuildingSpecs: BuildingSpecs = {
  buildingName: '',
  buildingPurpose: '',
  yearBuilt: null,
  yearRenovated: null,
  floorsCount: null,
  totalArea: null,
  normativeArea: null,
  roomsCount: null,
  officesCount: null,
  bathroomsCount: null,
  otherRooms: '',
  foundation: '',
  walls: '',
  ceilings: '',
  structure: '',
  roof: '',
  flooring: '',
  windows: '',
  phone: '',
  electricity: '',
  water: '',
  sewerage: '',
  heating: '',
  landArea: null,
  landPurpose: '',
};

// Базовые документы объекта (выписка из реестра, техпаспорт, документы на
// землю) — показываются прямо в карточке объекта, а не во вкладке
// "Документы" (та — про сгенерированные договоры по шаблонам для лидов).
// Файлы лежат в Supabase Storage (бакет object-documents), здесь хранится
// только их метаданные.
export const objectDocumentCategories = ['registryExtract', 'techPassport', 'landDocs'] as const;
export type ObjectDocumentCategory = (typeof objectDocumentCategories)[number];

export const objectDocumentLabels: Record<ObjectDocumentCategory, string> = {
  registryExtract: 'Выписка из реестра',
  techPassport: 'Технический паспорт',
  landDocs: 'Документы на землю',
};

export interface ObjectDocumentFile {
  url: string;
  fileName: string;
  uploadedAt: string;
}

export type ObjectDocuments = Partial<Record<ObjectDocumentCategory, ObjectDocumentFile>>;

export interface RealtyObject {
  id: string;
  // Маркетинговое название объекта (например, "Minsk One") — отдельно от
  // address: адрес нужен всегда и везде (сравнения, ссылки, формы), название —
  // необязательная надпись для карточки в списке. Пустая строка — карточка
  // показывает адрес как заголовок, как было раньше этого поля.
  name: string;
  // Пусто — статус не указан. "Деловой центр"/"Склад" или своё значение —
  // см. objectStatuses выше. Показывается бейджем на превью, как
  // Pledge.propertyType у залогов.
  status: string;
  address: string;
  area: number;
  startPrice: number;
  // Фото объекта — массив (до 10, см. MAX_PHOTOS в ObjectFormModal), листаются
  // слайдером (PhotoCarousel) и на превью карточки, и в лайтбоксе. Раньше было
  // одно фото (photoUrl); при миграции старое значение переносится первым
  // элементом массива, см. комментарий у RealtyObjectRow.photo_urls.
  photoUrls: string[];
  floorPlanUrls: string[];
  listingUrl: string;
  owner: string;
  ownerContact: string;
  contactName: string;
  contactPosition: string;
  contactChannel: ContactChannel | '';
  notes: string;
  concept: string;
  demandLinks: DemandLink[];
  inspectionMediaUrl: string;
  buildingPlanIds: string[];
  buildingSpecs: BuildingSpecs | null;
  documents: ObjectDocuments;
  // Отдельный непредсказуемый идентификатор для публичной ссылки на
  // планировку (/plan/:token) — специально не сам id объекта, чтобы клиент
  // не мог просто отредактировать URL и попасть на внутреннюю страницу
  // /objects/:id (весь остальной сайт открыт без логина).
  shareToken: string;
  // Короткий читаемый URL продающей страницы объекта (/:landingSlug,
  // например "one") — в отличие от shareToken специально предсказуемый и
  // редактируемый вручную, чтобы ссылку можно было использовать в рекламе.
  // Пустая строка — страница ещё не привязана ни к одному пути.
  landingSlug: string;
  // Рендеры кабинетов для слайдера на продающей странице (/:landingSlug) —
  // отдельно от photoUrl/floorPlanUrls, которые используются во внутренней
  // карточке объекта и в лайтбоксе.
  renderImageUrls: string[];
  // Шаблон соглашения о намерениях для блока "Бронирование без предоплаты"
  // на продающей странице — намеренно отдельное поле, а не категория в
  // documents: это маркетинговый материал для клиента, а не официальный
  // документ объекта (выписка/техпаспорт/землеотвод).
  intentAgreementFile: ObjectDocumentFile | null;
  // Ссылка на эмбед карты из Яндекс.Карт Конструктора (constructor.yandex.ru) —
  // именно iframe-ссылка на готовую карту с меткой, не координаты и не API-
  // ключ. Осознанный выбор: не нужен свой аккаунт разработчика/ключ Яндекса,
  // при этом зум/панорамирование карты — родные, самого Яндекс.Карт.
  mapEmbedUrl: string;
  // Приоритетные объекты идут первыми в списке "Объекты в проработке" и
  // получают бейдж "🔥 Приоритет" на превью — ручная отметка, не связана
  // со статусом/датой создания.
  priority: boolean;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/objectsApi.ts
export interface RealtyObjectRow {
  id: string;
  name: string | null;
  status: string | null;
  address: string;
  area: number;
  start_price: number;
  // Новая колонка вместо photo_url (одиночного фото) — см. миграцию,
  // которую нужно выполнить вручную в Supabase (переносит старое photo_url
  // первым элементом массива и оставляет photo_url в базе неиспользуемым).
  photo_urls: string[] | null;
  floor_plan_urls: string[] | null;
  listing_url: string;
  owner: string;
  owner_contact: string;
  contact_name: string | null;
  contact_position: string | null;
  contact_channel: string | null;
  notes: string;
  concept: string | null;
  demand_links: DemandLink[] | null;
  inspection_media_url: string | null;
  building_plan_ids: string[] | null;
  building_specs: BuildingSpecs | null;
  documents: ObjectDocuments | null;
  share_token: string;
  landing_slug: string | null;
  render_image_urls: string[] | null;
  intent_agreement_file: ObjectDocumentFile | null;
  map_embed_url: string | null;
  priority: boolean | null;
}

export function pricePerMeter(area: number, startPrice: number): number | null {
  if (!area || area <= 0) return null;
  return startPrice / area;
}

// ID объявления — используется, чтобы сопоставить ссылку из "Проверки спроса"
// со строкой статистики в demand_stats (см. scripts/sync-*-stats.mjs).
// У Kufar/Realt id — отдельный числовой сегмент пути. У Avito id приклеен
// к слагу через подчёркивание в последнем сегменте (.../kvartira_2701234567),
// поэтому вторым шагом ищем числовой хвост последнего сегмента. У
// Megapolis-real числового id в URL вообще нет — только текстовый слаг файла
// (.../pomescheniya-....html), поэтому для этого домена используем сам слаг
// (без расширения) как ad_id.
export function extractAdId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (parsed.hostname.replace(/^www\./, '') === 'megapolis-real.by') {
      const last = segments[segments.length - 1];
      return last ? last.replace(/\.html?$/i, '') : null;
    }
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d{5,}$/.test(segments[i])) return segments[i];
    }
    const trailing = segments[segments.length - 1]?.match(/(\d{6,})$/);
    if (trailing) return trailing[1];
  } catch {
    // не похоже на валидный URL
  }
  return null;
}
