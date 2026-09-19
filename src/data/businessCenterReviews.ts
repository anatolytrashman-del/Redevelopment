// Реальные отзывы с Яндекс.Карт (не ручные цитаты из highlights — см.
// BusinessCenterMarketBlocks.tsx) — таблица business_center_review_snapshots,
// заполняется точечным импортом .webarchive владельцем (см.
// docs/session-journal.md, 2026-09-19). likes/dislikes — реальные голоса
// читателей Яндекса под отзывом, не наша оценка.
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
