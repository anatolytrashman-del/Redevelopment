// Реальные отзывы с Яндекс.Карт (не ручные цитаты из highlights — см.
// BusinessCenterMarketBlocks.tsx) — таблица business_center_review_snapshots,
// заполняется автоматическим разбором .webarchive/.html в браузере при
// сохранении карточки БЦ (BusinessCentersAdminTab.tsx, поле «Файлы для
// ресерча»; сам файл не грузится в Storage, см. docs/session-journal.md,
// 2026-09-19/20). likes/dislikes — реальные голоса читателей Яндекса под
// отзывом, не наша оценка.
export interface BusinessCenterReview {
  id: string;
  businessCenterSlug: string;
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
  author: string | null;
  rating: number | null;
  body: string;
  likes: number;
  dislikes: number;
  published_at: string | null;
}
