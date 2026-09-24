import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { loadBcExtra, peekBcExtra } from './buildData';
import type {
  BusinessCenterTenantSnapshot,
  BusinessCenterTenantSnapshotRow,
  TenantSourceOrganization,
} from '../data/businessCenterTenants';

export const YANDEX_TENANT_SOURCE = 'yandex_maps';

// Разбор защитный, как и у 2GIS-снапшота: jsonb пишет скрипт сбора, схемы у
// него нет, и одна кривая карточка в выдаче не должна ронять всю страницу БЦ.
function parseOrganizations(raw: unknown): TenantSourceOrganization[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((org): org is Record<string, unknown> => !!org && typeof org === 'object' && typeof org.name === 'string')
    .map((org) => ({
      name: (org.name as string).trim(),
      sourceId: typeof org.sourceId === 'string' ? org.sourceId : null,
      sourceUrl: typeof org.sourceUrl === 'string' ? org.sourceUrl : null,
      category: typeof org.category === 'string' && org.category.trim() !== '' ? (org.category as string).trim() : null,
      rating: typeof org.rating === 'number' ? org.rating : null,
      reviewCount: typeof org.reviewCount === 'number' ? org.reviewCount : null,
      rawText: typeof org.rawText === 'string' ? org.rawText : null,
      floor: typeof org.floor === 'string' && org.floor.trim() !== '' ? org.floor.trim() : null,
      coords: parseCoords(org.coords),
    }))
    .filter((org) => org.name !== '');
}

function parseCoords(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [lon, lat] = raw.map(Number);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function fromRow(row: BusinessCenterTenantSnapshotRow): BusinessCenterTenantSnapshot {
  const organizations = parseOrganizations(row.organizations);
  return {
    slug: row.business_center_slug,
    source: row.source,
    sourceUrl: row.source_url,
    organizations,
    organizationCount: row.organization_count ?? organizations.length,
    capturedAt: row.captured_at,
  };
}

// По одному слагу за раз — это данные ровно одного здания, как и
// fetchBusinessCenter2gisSnapshot. RLS для anon открывает только колонки из
// select ниже: id и address_query (поисковая строка сбора) остаются
// внутренними.
// Синхронно из уже пришедшего файла сборки — для первого рендера карточки.
// undefined — файл ещё не пришёл (не знаем), null — снимка у здания нет.
export function peekBusinessCenterTenantSnapshot(slug: string): BusinessCenterTenantSnapshot | null | undefined {
  const extra = peekBcExtra(slug);
  if (!extra) return undefined;
  return extra.tenants ? fromRow(extra.tenants as BusinessCenterTenantSnapshotRow) : null;
}

export async function fetchBusinessCenterTenantSnapshot(slug: string): Promise<BusinessCenterTenantSnapshot | null> {
  // Файл .extra из сборки (src/lib/buildData.ts) — там уже только срез
  // Яндекса (source = YANDEX_TENANT_SOURCE), как и в выборке ниже.
  const extra = await loadBcExtra(slug);
  if (extra) return extra.tenants ? fromRow(extra.tenants as BusinessCenterTenantSnapshotRow) : null;
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('business_center_tenant_source_snapshots')
      .select('business_center_slug,source,source_url,organizations,organization_count,captured_at')
      .eq('business_center_slug', slug)
      .eq('source', YANDEX_TENANT_SOURCE)
      .maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as BusinessCenterTenantSnapshotRow) : null;
  });
}
