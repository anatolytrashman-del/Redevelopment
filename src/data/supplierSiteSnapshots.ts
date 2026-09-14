// Снимок сайта поставщика: что компания поставляет — по разделам её
// каталога. Строка на ДОМЕН (не на карточку): одна компания живёт в
// нескольких категориях закупок, а сайт у неё один; фронт находит снимок
// по supplierWebsiteHost(offer.websiteUrl).
//
// Заполняется в два шага без участия админки: Edge Function
// process-supplier-jobs скачивает разделы (sections, без модели), сессия
// Claude Code раскладывает их по товарным группам (categories, справочник —
// data/supplyCategories.ts). Новые домены ставит в очередь триггер в базе
// при сохранении карточки с сайтом. Подробности — миграция
// supabase/migrations/20260912-supplier-site-snapshots.sql.
//
// Колонки categories_verified/categories_verified_at (миграция
// 20260913-supplier-site-snapshots-verification.sql) заведены давно под
// другой смысл (первая версия вкладки "Верификация" ставила отметку сюда,
// владелец тем же днём попросил другую механику — см. SupplierOffer.verified
// в data/supplierResearch.ts) и какое-то время были неиспользуемыми.
//
// Переиспользованы 2026-09-13 (шестой заход) под НОВЫЙ смысл: массовая
// переклассификация 2026-09-13 ("второй заход", 14 Haiku-субагентов на
// оторванных от контекста строках ассортимента без сайта) оказалась
// массово ненадёжной — см. docs/supplier-catalog-expansion.md, разбор
// кейсов abb-electro.ru/oaomkk.ru/priorglass.ru. Вместо того чтобы залпом
// переклассифицировать все ~850 подозрительных доменов и рисковать той же
// ошибкой в новом виде, владелец попросил дообучать пошагово: маленькими
// пачками, каждая — реальные разделы сайта (не оторванный текст) + ручная
// сверка результата с владельцем перед следующей пачкой.
// categories_verified = true теперь означает "категории пересчитаны по
// новому, проверенному методу и выведены владельцу на ручную проверку" —
// ТОЛЬКО такие домены попадают в основную очередь вкладки "Верификация"
// (см. isReadyForVerification в SupplierVerificationTab.tsx) — вся
// остальная база (в т.ч. старые корректные снимки без этой отметки)
// временно вне очереди, пока не прогнана тем же методом и не помечена.
//
// Сам метод с 2026-09-14 — scripts/supply-categories/review.mjs
// (next → diff → apply) + правила в scripts/supply-categories/LESSONS.md:
// пачка из 10 компаний, классифицирует основная модель сессии по полному
// дереву разделов сайта, у каждой группы обязательная "улика" — раздел
// сайта дословно, apply не пишет группу без найденной улики. Поправки
// владельца после ручной проверки пачки становятся правилами в LESSONS.md.
export type SupplierSiteSnapshotStatus = 'pending' | 'processing' | 'done' | 'error';

export interface SupplierSiteSection {
  title: string;
  url: string;
}

export interface SupplierSiteSnapshot {
  host: string;
  websiteUrl: string;
  status: SupplierSiteSnapshotStatus;
  pageTitle: string;
  metaDescription: string;
  sections: SupplierSiteSection[];
  error: string | null;
  fetchedAt: string | null;
  // Товарные группы из справочника SUPPLY_CATEGORIES (пусто — ещё не
  // классифицирован или по сайту ничего не понять).
  categories: string[];
  categoriesNote: string;
  classifiedAt: string | null;
  // См. комментарий выше — "прошёл переклассификацию по новому методу и
  // одобрен владельцем", не "категории вообще существуют" (у старых
  // снимков categories может быть непустым, а categoriesVerified — false).
  categoriesVerified: boolean;
  categoriesVerifiedAt: string | null;
}

export interface SupplierSiteSnapshotRow {
  host: string;
  website_url: string;
  status: string;
  page_title: string | null;
  meta_description: string | null;
  sections: unknown;
  error: string | null;
  fetched_at: string | null;
  categories: string[] | null;
  categories_note: string | null;
  classified_at: string | null;
  categories_verified: boolean | null;
  categories_verified_at: string | null;
}
