import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { triggerPublicRebuild } from './publicRebuild';
import type {
  BusinessCenter,
  BusinessCenterDerivedField,
  BusinessCenterLayoutType,
  BusinessCenterRow,
} from '../data/businessCenters';

function fromRow(row: BusinessCenterRow): BusinessCenter {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    altNames: Array.isArray(row.alt_names) ? row.alt_names.filter((n) => typeof n === 'string' && n.trim()) : [],
    address: row.address,
    district: row.district,
    microdistrict: row.microdistrict,
    businessClass: (row.business_class as BusinessCenter['businessClass']) ?? null,
    totalArea: row.total_area,
    yearBuilt: row.year_built,
    floors: row.floors,
    developer: row.developer,
    metro: row.metro,
    parking: row.parking,
    website: row.website,
    description: row.description,
    rentalInfo: row.rental_info,
    highlights: row.highlights ?? [],
    mapSnapshotFiles: row.map_snapshot_files ?? [],
    tenantOrganizations: row.tenant_organizations ?? [],
    technicalParams: row.technical_params ?? [],
    nearestMetroStations: row.nearest_metro_stations ?? [],
    floorPlateArea: row.floor_plate_area,
    officeArea: row.office_area,
    layoutTypes: (row.layout_types ?? []) as BusinessCenterLayoutType[],
    elevators: row.elevators,
    parkingRatio: row.parking_ratio,
    airConditioning: (row.air_conditioning as BusinessCenter['airConditioning']) ?? null,
    ceilingHeight: row.ceiling_height,
    managementType: (row.management_type as BusinessCenter['managementType']) ?? null,
    metroDistanceBucket: (row.metro_distance_bucket as BusinessCenter['metroDistanceBucket']) ?? null,
    freeSpaceMin: row.free_space_min,
    freeSpaceMax: row.free_space_max,
    infraInternal: row.infra_internal ?? [],
    infraNearby: row.infra_nearby ?? [],
    lat: row.lat,
    lng: row.lng,
    gisRating: row.gis_rating,
    gisReviewCount: row.gis_review_count,
    is24x7: row.is_24x7,
    accessibility: row.accessibility ?? [],
    verdict: row.verdict,
    pros: row.pros ?? [],
    cons: row.cons ?? [],
    verdictEdited: row.verdict_edited ?? false,
    photos: row.photos ?? [],
    status: (row.status as BusinessCenter['status']) ?? 'built',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function fetchBusinessCenters(): Promise<BusinessCenter[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('business_centers').select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    return (data as BusinessCenterRow[]).map(fromRow);
  });
}

// Производные колонки в payload не входят вовсе — их считает триггер в
// базе при каждой записи technical_params (см. миграцию
// 20260916-bc-structured-tech-params.sql и BusinessCenterDerivedField).
type BusinessCenterInput = Omit<BusinessCenter, 'id' | 'createdAt' | BusinessCenterDerivedField>;

function toPayload(input: Partial<BusinessCenterInput>) {
  const payload: Record<string, unknown> = {};
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.name !== undefined) payload.name = input.name;
  if (input.altNames !== undefined) payload.alt_names = input.altNames;
  if (input.address !== undefined) payload.address = input.address;
  if (input.district !== undefined) payload.district = input.district;
  if (input.microdistrict !== undefined) payload.microdistrict = input.microdistrict;
  if (input.businessClass !== undefined) payload.business_class = input.businessClass;
  if (input.totalArea !== undefined) payload.total_area = input.totalArea;
  if (input.yearBuilt !== undefined) payload.year_built = input.yearBuilt;
  if (input.floors !== undefined) payload.floors = input.floors;
  if (input.developer !== undefined) payload.developer = input.developer;
  if (input.metro !== undefined) payload.metro = input.metro;
  if (input.parking !== undefined) payload.parking = input.parking;
  if (input.website !== undefined) payload.website = input.website;
  if (input.description !== undefined) payload.description = input.description;
  if (input.rentalInfo !== undefined) payload.rental_info = input.rentalInfo;
  if (input.highlights !== undefined) payload.highlights = input.highlights;
  if (input.mapSnapshotFiles !== undefined) payload.map_snapshot_files = input.mapSnapshotFiles;
  if (input.tenantOrganizations !== undefined) payload.tenant_organizations = input.tenantOrganizations;
  if (input.technicalParams !== undefined) payload.technical_params = input.technicalParams;
  if (input.nearestMetroStations !== undefined) payload.nearest_metro_stations = input.nearestMetroStations;
  if (input.photos !== undefined) payload.photos = input.photos;
  if (input.verdict !== undefined) payload.verdict = input.verdict;
  if (input.pros !== undefined) payload.pros = input.pros;
  if (input.cons !== undefined) payload.cons = input.cons;
  if (input.verdictEdited !== undefined) payload.verdict_edited = input.verdictEdited;
  if (input.status !== undefined) payload.status = input.status;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  return payload;
}

// Правка бизнес-центра в админке → пересборка каталога БЦ на проде (scope
// 'business_centers' — карточки и хабы БЦ, см. lib/publicRebuild.ts). До
// 2026-09-12 правки БЦ пересборку не запускали вовсе и попадали на прод
// только попутно, с ближайшим полным рендером по другой причине.
export async function insertBusinessCenter(input: BusinessCenterInput): Promise<BusinessCenter> {
  const created = await withRetry(async () => {
    const { data, error } = await supabase.from('business_centers').insert(toPayload(input)).select().single();
    if (error) throw error;
    return fromRow(data as BusinessCenterRow);
  });
  triggerPublicRebuild('business_centers');
  return created;
}

export async function updateBusinessCenter(id: string, input: Partial<BusinessCenterInput>): Promise<BusinessCenter> {
  const updated = await withRetry(async () => {
    const { data, error } = await supabase.from('business_centers').update(toPayload(input)).eq('id', id).select().single();
    if (error) throw error;
    return fromRow(data as BusinessCenterRow);
  });
  triggerPublicRebuild('business_centers');
  return updated;
}

export async function deleteBusinessCenter(id: string): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabase.from('business_centers').delete().eq('id', id);
    if (error) throw error;
  });
  triggerPublicRebuild('business_centers');
}
