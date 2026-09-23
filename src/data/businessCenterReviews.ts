// Реальные отзывы — не ручные цитаты из highlights (см.
// BusinessCenterMarketBlocks.tsx) — таблица business_center_review_snapshots.
// Два источника: `yandex_maps` заполняется автоматическим разбором
// .webarchive/.html в браузере при сохранении карточки БЦ
// (BusinessCentersAdminTab.tsx, поле «Файлы для ресерча»; сам файл не
// грузится в Storage, см. docs/session-journal.md, 2026-09-19/20); `2gis` —
// разбор веб-архива карточки организации в 2ГИС вручную (ключ API 2ГИС
// заблокирован владельцем с 2026-09-20, см. журнал того же числа), заливка
// разовыми SQL-вставками, не через форму. likes/dislikes — реальные голоса
// читателей под отзывом у Яндекса; у 2ГИС на странице отзыва счётчика
// «полезно» нет, поэтому там всегда 0/0, не наша оценка.
export interface BusinessCenterReview {
  id: string;
  businessCenterSlug: string;
  source: 'yandex_maps' | '2gis';
  author: string | null;
  rating: number | null;
  body: string;
  likes: number;
  dislikes: number;
  publishedAt: string | null;
}

export interface BusinessCenterReviewRow {
  id: string;
  business_center_slug: string;
  source: 'yandex_maps' | '2gis';
  author: string | null;
  rating: number | null;
  body: string;
  likes: number;
  dislikes: number;
  published_at: string | null;
}
