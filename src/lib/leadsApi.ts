import { supabase } from './supabase';
import { withRetry, UPLOAD_TIMEOUT_MS } from './withRetry';
import type { Lead, LeadRow } from '../data/leads';

const LEAD_PHOTOS_BUCKET = 'lead-photos';
// Час: карточку лида держат открытой недолго, а ссылка не должна оставаться
// рабочей после того, как её случайно куда-то скопировали.
const PHOTO_URL_TTL_SECONDS = 60 * 60;

function fromRow(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    source: row.source as Lead['source'],
    businessType: row.business_type,
    area: row.area,
    requirement: row.requirement,
    contact: row.contact,
    contactMethod: row.contact_method ?? '',
    phone: row.phone ?? '',
    clientType: row.client_type ?? '',
    status: row.status,
    isWarm: row.is_warm,
    objectId: row.object_id ?? '',
    photoPath: row.photo_path ?? '',
    createdAt: row.created_at,
    lastContactedAt: row.last_contacted_at ?? '',
    nextContactAt: row.next_contact_at ?? '',
  };
}

export function fetchLeads(): Promise<Lead[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as LeadRow[]).map(fromRow);
  });
}

// Для бейджа непрочитанных лидов в сайдбаре — тот же паттерн, что и у
// "Предложить идею" (см. fetchBacklogUnreadCount в backlogApi.ts).
export function fetchLeadsUnreadCount(sinceIso: string): Promise<number> {
  return withRetry(async () => {
    const { count, error } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', sinceIso);
    if (error) throw error;
    return count ?? 0;
  });
}

export function fetchLeadsForObject(objectId: string): Promise<Lead[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('object_id', objectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as LeadRow[]).map(fromRow);
  });
}

export function insertLead(input: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        name: input.name,
        source: input.source,
        business_type: input.businessType,
        area: input.area,
        requirement: input.requirement,
        contact: input.contact,
        contact_method: input.contactMethod || null,
        phone: input.phone || null,
        client_type: input.clientType || null,
        status: input.status,
        is_warm: input.isWarm,
        object_id: input.objectId || null,
        photo_path: input.photoPath || null,
        last_contacted_at: input.lastContactedAt || null,
        next_contact_at: input.nextContactAt || null,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as LeadRow);
  });
}

export function updateLead(id: string, input: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('leads')
      .update({
        name: input.name,
        source: input.source,
        business_type: input.businessType,
        area: input.area,
        requirement: input.requirement,
        contact: input.contact,
        contact_method: input.contactMethod || null,
        phone: input.phone || null,
        client_type: input.clientType || null,
        status: input.status,
        is_warm: input.isWarm,
        object_id: input.objectId || null,
        photo_path: input.photoPath || null,
        last_contacted_at: input.lastContactedAt || null,
        next_contact_at: input.nextContactAt || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as LeadRow);
  });
}

export function deleteLead(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
  });
}

// Фото лида лежат в ЗАКРЫТОМ бакете — в отличие от фотографий объектов
// (uploadObjectImage в objectsApi.ts), которые публичные. Это фотографии
// клиентов, и постоянная публичная ссылка на них не должна гулять по перепискам.
//
// Из-за этого возвращается путь файла, а не URL: готовой вечной ссылки у
// закрытого бакета нет, её каждый раз подписывают заново (createLeadPhotoUrl).
// В базе хранится именно путь — см. Lead.photoPath.
export function uploadLeadPhoto(file: File): Promise<string> {
  return withRetry(
    async () => {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(LEAD_PHOTOS_BUCKET).upload(path, file);
      if (error) throw error;
      return path;
    },
    1000,
    UPLOAD_TIMEOUT_MS,
  );
}

// Подписанная ссылка на фото, живёт PHOTO_URL_TTL_SECONDS. Пустая строка на
// входе или неудача подписи дают null — вызывающий показывает заглушку с
// инициалами, а не битую картинку.
export async function createLeadPhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(LEAD_PHOTOS_BUCKET)
      .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

// Удаление файла — best-effort: вызывается при замене и удалении фото, но
// осиротевший файл в бакете менее неприятен, чем упавшее сохранение лида,
// поэтому ошибку глушим.
export async function deleteLeadPhoto(path: string): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(LEAD_PHOTOS_BUCKET).remove([path]);
  } catch {
    // намеренно молча
  }
}
