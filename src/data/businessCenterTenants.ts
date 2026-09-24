// Организации в здании по срезу Яндекс.Карт — основной источник арендаторов
// с 2026-09-19 (решение владельца, Б13 в docs/bc-catalog-redesign-plan.md).
// Срез снимает полуавтоматический scripts/capture-yandex-bc-tenants.mjs
// (живой Chrome, CAPTCHA проходит человек) в таблицу
// business_center_tenant_source_snapshots: одна строка на пару
// (бизнес-центр, источник), организации — массивом в jsonb.
//
// Почему он, а не 2GIS: 7608 организаций по 139 зданиям против 4614 по 138,
// и на организацию есть этаж, офис, рейтинг и ссылка на карточку, которых у
// 2GIS нет вовсе; плюс у 2GIS жёсткий потолок выдачи в 50 организаций на
// здание, из-за которого у 26 зданий доли считались по неполному списку.
// 2GIS остался фолбэком для зданий, которых в яндексовском срезе нет.

// Организация ровно в том виде, в каком её кладёт в jsonb скрипт сбора.
// rawText — текст карточки из выдачи целиком: место в здании (этаж, офис,
// подъезд) Яндекс не отдаёт отдельным полем, и достать его можно только
// разбором этой строки (см. parseTenantPlacement в lib/tenantCategories.ts).
export interface TenantSourceOrganization {
  name: string;
  sourceId: string | null;
  sourceUrl: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  rawText: string | null;
  // Этаж, проставленный скриптом сбора (2026-09-24): из текста плитки, а если
  // там пусто — уровень поэтажного плана из карточки самой организации.
  // Старые снимки его не имеют — тогда этаж разбирается из rawText.
  floor?: string | null;
}

export interface BusinessCenterTenantSnapshot {
  slug: string;
  source: string;
  sourceUrl: string | null;
  organizations: TenantSourceOrganization[];
  organizationCount: number;
  capturedAt: string | null;
}

export interface BusinessCenterTenantSnapshotRow {
  business_center_slug: string;
  source: string;
  source_url: string | null;
  organizations: unknown;
  organization_count: number | null;
  captured_at: string | null;
}

// Организация в том виде, в каком её рисует карточка БЦ. Общий тип для обоих
// источников: у 2GIS placement/rating/reviewCount/url всегда null, и блок
// просто не рисует то, чего нет, — вместо двух почти одинаковых компонентов.
export interface TenantOrganizationView {
  name: string;
  rubric: string | null;
  industry: string | null;
  placement: string | null;
  floor: string | null;
  rating: number | null;
  reviewCount: number | null;
  url: string | null;
}
