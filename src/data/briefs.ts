// Техзадание для инженера, который считает смету ремонта — привязано к
// существующему объекту (RealtyObject), переиспользует его планировки и
// технический паспорт (BuildingSpecs), а не дублирует их. Публикуется по
// share_token на /tz/:token — сам документ не требует пароля админки, его
// смотрит внешний инженер.
export interface Brief {
  id: string;
  objectId: string;
  // Фото — публичные URL из бакета object-photos (uploadObjectImage), тот же
  // бакет, что и у фото/планировок/рендеров объекта — не сам объект, не
  // приватные данные, поэтому без закрытого бакета и подписанных ссылок.
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
  // Свободный текст с комментариями по каждому изменению — не структурированный
  // список: инженеру важно прочитать пояснение, а не просто галочки.
  interiorChanges: string;
  facadeChanges: string;
  shareToken: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/briefsApi.ts
export interface BriefRow {
  id: string;
  object_id: string;
  before_photo_urls: string[] | null;
  after_photo_urls: string[] | null;
  interior_changes: string | null;
  facade_changes: string | null;
  share_token: string;
  created_at: string;
}
