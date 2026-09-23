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
    developerInfo: row.developer_info,
    metro: row.metro,
    parking: row.parking,
    website: row.website,
    description: row.description,
    rentalInfo: row.rental_info,
    highlights: row.highlights ?? [],
    mapSnapshotFiles: row.map_snapshot_files ?? [],
    mediaMentions: row.media_mentions ?? [],
    tenantOrganizations: row.tenant_organizations ?? [],
    tenantCount: row.tenant_count ?? (row.tenant_organizations?.length ?? 0),
    technicalParams: row.technical_params ?? [],
    buildingFacts: row.building_facts ?? [],
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
    reviewsChecked: row.reviews_checked ?? false,
    photos: row.photos ?? [],
    status: (row.status as BusinessCenter['status']) ?? 'built',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// Колонки для СПИСКА зданий (замер 2026-09-22, Ш3 плана
// docs/bc-catalog-seo-plan.md). Раньше все публичные страницы раздела —
// каталог, 40+ хабов, рейтинги, гид, аналитика, избранное И карточка БЦ —
// звали одну и ту же выборку `select('*')`: 969 КБ сжатых, 3,17 МБ
// распакованного JSON на каждый заход. На телефоне тело ответа грузилось
// ~3,8 с, и всё это время страница стояла с «Загрузка…» ВМЕСТО уже
// отрисованной пререндером разметки — отсюда и CLS 0,22–0,29, и пустой
// экран на две секунды посреди загрузки.
//
// Из выборки убраны четыре группы колонок, которые списку не нужны ни для
// карточек, ни для фильтров, ни для FAQ:
//   official_site_snapshot_* — сырой текст сайта БЦ, 438 КБ, не читает никто;
//   tenant_organizations     — 342 КБ; спискам хватает tenant_count;
//   technical_params, rental_info, building_facts, developer_info,
//   media_mentions, map_snapshot_files — блоки, которые есть только на
//   карточке здания, а ей теперь отвечает fetchBusinessCenter(slug).
// Итог замера: 969 КБ → 149 КБ.
//
// highlights (148 КБ) и accessibility остаются: по ним работают фильтр и
// сортировка каталога (рейтинг Яндекс.Карт) и обе страницы рейтинга.
//
// Поле, выпавшее из выборки, приезжает в BusinessCenter пустым (fromRow
// подставляет []/null) — молча и без ошибки. Поэтому всё, что читает такие
// поля, обязано брать их из fetchBusinessCenter/fetchBusinessCentersFull, а
// не из списка.
const LIST_COLUMNS = [
  'id',
  'slug',
  'name',
  'alt_names',
  'address',
  'district',
  'microdistrict',
  'business_class',
  'total_area',
  'office_area',
  'floor_plate_area',
  'free_space_min',
  'free_space_max',
  'year_built',
  'floors',
  'ceiling_height',
  'elevators',
  'parking',
  'parking_ratio',
  'air_conditioning',
  'is_24x7',
  'management_type',
  'metro',
  'metro_distance_bucket',
  'nearest_metro_stations',
  'lat',
  'lng',
  'website',
  'developer',
  'description',
  'layout_types',
  'infra_internal',
  'infra_nearby',
  'accessibility',
  'highlights',
  'photos',
  'gis_rating',
  'gis_review_count',
  'tenant_count',
  'verdict',
  'verdict_edited',
  'reviews_checked',
  'pros',
  'cons',
  'status',
  'sort_order',
  'created_at',
].join(',');

// --- Данные из сборки (Ш3-b плана docs/bc-catalog-seo-plan.md) ---------
//
// Инлайн-скрипт в index.html начинает качать статические файлы раздела ещё
// до бандла и оставляет промисы в window. Здесь они разбираются один раз
// перед монтированием (см. main.tsx), и страницы получают данные СИНХРОННО
// в первом же рендере — иначе React, который сносит пререндер-снапшот и
// строит DOM заново, показывал бы «Загрузка…» вместо готовой страницы.
interface BuildSnapshotWindow {
  __bcList?: Promise<{ generatedAt: string; rows: BusinessCenterRow[] } | null>;
  __bcDetail?: { slug: string; data: Promise<{ generatedAt: string; row: BusinessCenterRow } | null> };
}

// Пока снимок свежий, запрос в Supabase со страницы не уходит вовсе: файл —
// ровесник пререндер-снапшота, то есть показывает ровно то же, что видит
// поисковик в разметке. Час — период пересборки публичных страниц
// (pg_cron, см. CLAUDE.md). Снимок старше — значит сборки давно не было, и
// свежесть важнее лишних килобайт: идём в базу, как раньше.
const SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000;

// Снимок хранит время своей сборки, а не готовый флаг «свежий»: свежесть
// проверяется при КАЖДОМ обращении. Флаг, посчитанный один раз при
// монтировании, в долго открытой вкладке не протухал бы никогда — спустя
// сутки SPA-переходов по хабам страницы всё ещё отдавали бы утренний снимок,
// так и не заглянув в базу.
let snapshotList: { generatedAt: string; centers: BusinessCenter[] } | null = null;
let snapshotDetail: { generatedAt: string; slug: string; center: BusinessCenter } | null = null;

// Для первого рендера снимок годится любой давности — это те же данные, что
// уже стоят в пререндер-разметке; свежесть решает только, идти ли в базу
// (см. fetchBusinessCenters/fetchBusinessCenter).
export function snapshotBusinessCenters(): BusinessCenter[] | null {
  return snapshotList?.centers ?? null;
}

export function snapshotBusinessCenter(slug: string): BusinessCenter | null {
  return snapshotDetail && snapshotDetail.slug === slug ? snapshotDetail.center : null;
}

function isFresh(generatedAt: string | undefined): boolean {
  if (!generatedAt) return false;
  const age = Date.now() - new Date(generatedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < SNAPSHOT_MAX_AGE_MS;
}

// Ждём ровно столько, сколько не жалко: не пришло — страница работает как
// раньше, через Supabase. Таймаут тут не «на всякий случай», а условие
// монтирования: main.tsx ждёт этот промис. Каждый файл кладётся в снимок
// сам по себе, как только пришёл: список не должен ждать файл здания (и
// наоборот) — если по таймауту успел только один, страница возьмёт хотя бы
// его.
export async function primeBusinessCentersFromBuild(timeoutMs = 2500): Promise<void> {
  if (typeof window === 'undefined') return;
  const w = window as unknown as BuildSnapshotWindow;
  if (!w.__bcList && !w.__bcDetail) return;
  const list = Promise.resolve(w.__bcList ?? null)
    .then((data) => {
      if (data && Array.isArray(data.rows)) {
        snapshotList = { generatedAt: data.generatedAt, centers: data.rows.map(fromRow) };
      }
    })
    .catch(() => undefined);
  const detail = Promise.resolve(w.__bcDetail?.data ?? null)
    .then((data) => {
      // Файл здания попадает в снимок ТОЛЬКО когда реально пришёл. Нет файла
      // (404, оборванная загрузка, здание добавлено после сборки) — это «не
      // знаем», а не «такого здания нет»: раньше сюда записывался center:
      // null, fetchBusinessCenter отдавал его вместо похода в базу, и
      // карточка живого здания рисовала «не найдено» с noindex. Слаг берём
      // из самого ряда: сегмент пути может прийти в процентном кодировании,
      // а useParams отдаёт его раскодированным.
      if (data?.row) {
        snapshotDetail = { generatedAt: data.generatedAt, slug: data.row.slug, center: fromRow(data.row) };
      }
    })
    .catch(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([Promise.all([list, detail]), timeout]);
}

export function fetchBusinessCenters(): Promise<BusinessCenter[]> {
  // Свежий снимок из сборки — это те же колонки и тот же порядок, что
  // вернула бы выборка ниже; идти в базу за тем же самым незачем.
  if (snapshotList && isFresh(snapshotList.generatedAt)) return Promise.resolve(snapshotList.centers);
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('business_centers')
      .select(LIST_COLUMNS)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data as unknown as BusinessCenterRow[]).map(fromRow);
  }).catch((err) => fallbackToSnapshot(snapshotList?.centers, err));
}

// База не ответила — показываем снимок сборки любой давности, а не ошибку.
// 2026-09-23 Supabase закрыл проект за трафик (402 на любой запрос), снимки
// были старше часа, и страницы раздела шли в базу: каталог сносил готовую
// разметку в «Нет бизнес-центров», а карточка — в «не найден» с noindex
// прямо на глазах у поисковика. Устаревшие данные лучше пустой страницы.
function fallbackToSnapshot<T>(snapshot: T | undefined, err: unknown): T {
  if (snapshot === undefined) throw err;
  console.warn('[businessCenters] база недоступна — показываю данные из сборки', err);
  return snapshot;
}

// Полный ряд одного здания — для карточки БЦ: ей нужны и технические
// параметры, и арендаторы, и упоминания в СМИ, которых в списке нет.
// Один ряд — это десятки килобайт вместо мегабайта, и первый экран карточки
// больше не ждёт всю таблицу.
export function fetchBusinessCenter(slug: string): Promise<BusinessCenter | null> {
  if (snapshotDetail?.slug === slug && isFresh(snapshotDetail.generatedAt)) {
    return Promise.resolve(snapshotDetail.center);
  }
  return withRetry(async () => {
    const { data, error } = await supabase.from('business_centers').select('*').eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as BusinessCenterRow) : null;
  }).catch((err) => fallbackToSnapshot(snapshotDetail?.slug === slug ? snapshotDetail.center : undefined, err));
}

// Полная таблица — только админке (BusinessCentersAdminTab): там правят все
// поля разом, и вес не важен, страница за паролем.
export function fetchBusinessCentersFull(): Promise<BusinessCenter[]> {
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
  if (input.developerInfo !== undefined) payload.developer_info = input.developerInfo;
  if (input.metro !== undefined) payload.metro = input.metro;
  if (input.parking !== undefined) payload.parking = input.parking;
  if (input.website !== undefined) payload.website = input.website;
  if (input.description !== undefined) payload.description = input.description;
  if (input.rentalInfo !== undefined) payload.rental_info = input.rentalInfo;
  if (input.highlights !== undefined) payload.highlights = input.highlights;
  if (input.mapSnapshotFiles !== undefined) payload.map_snapshot_files = input.mapSnapshotFiles;
  if (input.mediaMentions !== undefined) payload.media_mentions = input.mediaMentions;
  if (input.tenantOrganizations !== undefined) payload.tenant_organizations = input.tenantOrganizations;
  if (input.technicalParams !== undefined) payload.technical_params = input.technicalParams;
  if (input.buildingFacts !== undefined) payload.building_facts = input.buildingFacts;
  if (input.nearestMetroStations !== undefined) payload.nearest_metro_stations = input.nearestMetroStations;
  if (input.photos !== undefined) payload.photos = input.photos;
  if (input.verdict !== undefined) payload.verdict = input.verdict;
  if (input.pros !== undefined) payload.pros = input.pros;
  if (input.cons !== undefined) payload.cons = input.cons;
  if (input.verdictEdited !== undefined) payload.verdict_edited = input.verdictEdited;
  if (input.reviewsChecked !== undefined) payload.reviews_checked = input.reviewsChecked;
  if (input.status !== undefined) payload.status = input.status;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  return payload;
}

// Правка бизнес-центра в админке → отметка «данные изменились» со scope
// 'business_centers' (карточки и хабы БЦ, см. lib/publicRebuild.ts).
// Пересборка по этой отметке идёт раз в час, не сразу: сохранений БЦ за
// сеанс бывают десятки, а scope 'business_centers' — это полный рендер ~285
// страниц по 6-7 минут (разбор 2026-09-19 в api/trigger-rebuild.js). До
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
