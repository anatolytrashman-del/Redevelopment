import { supabase } from './supabase';
import { withRetry, UPLOAD_TIMEOUT_MS } from './withRetry';
import type { ContactChannel, RealtyObject, RealtyObjectRow } from '../data/objects';

function fromRow(row: RealtyObjectRow): RealtyObject {
  return {
    id: row.id,
    name: row.name ?? '',
    status: row.status ?? '',
    address: row.address,
    area: row.area,
    startPrice: row.start_price,
    photoUrls: row.photo_urls ?? [],
    floorPlanUrls: row.floor_plan_urls ?? [],
    listingUrl: row.listing_url,
    owner: row.owner,
    ownerContact: row.owner_contact,
    contactName: row.contact_name ?? '',
    contactPosition: row.contact_position ?? '',
    contactChannel: (row.contact_channel as ContactChannel | null) ?? '',
    notes: row.notes,
    concept: row.concept ?? '',
    demandLinks: row.demand_links ?? [],
    inspectionMediaUrl: row.inspection_media_url ?? '',
    buildingPlanIds: row.building_plan_ids ?? [],
    buildingSpecs: row.building_specs ?? null,
    documents: row.documents ?? {},
    shareToken: row.share_token,
    landingSlug: row.landing_slug ?? '',
    renderImageUrls: row.render_image_urls ?? [],
    intentAgreementFile: row.intent_agreement_file ?? null,
    mapEmbedUrl: row.map_embed_url ?? '',
  };
}

export function fetchObjects(): Promise<RealtyObject[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('objects').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as RealtyObjectRow[]).map(fromRow);
  });
}

export function fetchObject(id: string): Promise<RealtyObject> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('objects').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Для /admin/objects/:idOrSlug — тот же landingSlug, что и в продающей
// ссылке (/:slug), теперь работает и во внутреннем адресе объекта, чтобы не
// таскать длинный uuid. Определяем колонку по формату значения — сравнение
// id (uuid-колонка) со строкой не в формате uuid упадёт ошибкой на стороне
// Postgres, поэтому не пробуем оба варианта одним запросом.
export function fetchObjectByIdOrSlug(idOrSlug: string): Promise<RealtyObject> {
  return withRetry(async () => {
    const column = UUID_RE.test(idOrSlug) ? 'id' : 'landing_slug';
    const { data, error } = await supabase.from('objects').select('*').eq(column, idOrSlug).single();
    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

// Для публичной страницы планировки (/plan/:token) — ищем по непредсказуемому
// share_token, а не по внутреннему id объекта (см. комментарий у RealtyObject.shareToken).
export function fetchObjectByShareToken(token: string): Promise<RealtyObject> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('objects').select('*').eq('share_token', token).single();
    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

// Для продающей страницы объекта (/:slug) — ищем по короткому читаемому
// landing_slug, а не по id (см. комментарий у RealtyObject.landingSlug).
export function fetchObjectByLandingSlug(slug: string): Promise<RealtyObject> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('objects').select('*').eq('landing_slug', slug).single();
    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

export function insertObject(input: Omit<RealtyObject, 'id' | 'shareToken'>): Promise<RealtyObject> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('objects')
      .insert({
        name: input.name.trim() || null,
        status: input.status || null,
        address: input.address,
        area: input.area,
        start_price: input.startPrice,
        photo_urls: input.photoUrls,
        floor_plan_urls: input.floorPlanUrls,
        listing_url: input.listingUrl,
        owner: input.owner,
        owner_contact: input.ownerContact,
        contact_name: input.contactName || null,
        contact_position: input.contactPosition || null,
        contact_channel: input.contactChannel || null,
        notes: input.notes,
        concept: input.concept,
        demand_links: input.demandLinks,
        inspection_media_url: input.inspectionMediaUrl || null,
        building_plan_ids: input.buildingPlanIds,
        building_specs: input.buildingSpecs,
        documents: input.documents,
        landing_slug: input.landingSlug.trim() || null,
        render_image_urls: input.renderImageUrls,
        intent_agreement_file: input.intentAgreementFile,
        map_embed_url: input.mapEmbedUrl.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

export function updateObject(id: string, input: Omit<RealtyObject, 'id' | 'shareToken'>): Promise<RealtyObject> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('objects')
      .update({
        name: input.name.trim() || null,
        status: input.status || null,
        address: input.address,
        area: input.area,
        start_price: input.startPrice,
        photo_urls: input.photoUrls,
        floor_plan_urls: input.floorPlanUrls,
        listing_url: input.listingUrl,
        owner: input.owner,
        owner_contact: input.ownerContact,
        contact_name: input.contactName || null,
        contact_position: input.contactPosition || null,
        contact_channel: input.contactChannel || null,
        notes: input.notes,
        concept: input.concept,
        demand_links: input.demandLinks,
        inspection_media_url: input.inspectionMediaUrl || null,
        building_plan_ids: input.buildingPlanIds,
        building_specs: input.buildingSpecs,
        documents: input.documents,
        landing_slug: input.landingSlug.trim() || null,
        render_image_urls: input.renderImageUrls,
        intent_agreement_file: input.intentAgreementFile,
        map_embed_url: input.mapEmbedUrl.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

// Порог, ниже которого не пересжимаем — уже маленький файл, лишняя работа.
const COMPRESS_THRESHOLD_BYTES = 600 * 1024;
const COMPRESS_MAX_DIMENSION = 1920;

// PNG со скриншотов/каталогов поставщиков (особенно с прозрачностью) весят
// в разы больше JPEG того же кадра — на нестабильной мобильной сети такой
// файл не успевает догрузиться даже за несколько попыток ("Load failed" /
// "Сервер не отвечает"), хотя тот же кадр в JPEG грузится мгновенно.
// Пересжимаем перед отправкой в любой формат, кроме уже небольших файлов.
// Прозрачность (если была) заливаем белым — иначе после конвертации в JPEG
// она стала бы чёрной.
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < COMPRESS_THRESHOLD_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COMPRESS_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    const newName = `${file.name.replace(/\.[^.]+$/, '')}.jpg`;
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    // Браузер не смог обработать (редкий формат и т.п.) — грузим оригинал как есть.
    return file;
  }
}

export async function uploadObjectImage(file: File): Promise<string> {
  const toUpload = await compressImageIfNeeded(file);
  return withRetry(
    async () => {
      const ext = toUpload.name.split('.').pop() ?? 'jpg';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('object-photos').upload(path, toUpload);
      if (error) throw error;
      const { data } = supabase.storage.from('object-photos').getPublicUrl(path);
      return data.publicUrl;
    },
    1500,
    UPLOAD_TIMEOUT_MS,
    3,
  );
}

export function uploadObjectDocument(file: File): Promise<{ url: string; fileName: string }> {
  return withRetry(
    async () => {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('object-documents').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('object-documents').getPublicUrl(path);
      return { url: data.publicUrl, fileName: file.name };
    },
    1500,
    UPLOAD_TIMEOUT_MS,
    3,
  );
}
