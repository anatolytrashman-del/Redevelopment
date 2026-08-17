import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { normalizeBriefPhotos, type Brief, type BriefRow } from '../data/briefs';

function fromRow(row: BriefRow): Brief {
  return {
    id: row.id,
    objectId: row.object_id,
    recipientName: row.recipient_name ?? '',
    recipientPhone: row.recipient_phone ?? '',
    photos: normalizeBriefPhotos(row.photos),
    shareToken: row.share_token,
    createdAt: row.created_at,
  };
}

export function fetchBriefs(): Promise<Brief[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('briefs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as BriefRow[]).map(fromRow);
  });
}

// Публичная страница /tz/:token — по share_token, не по внутреннему id (тот
// же паттерн, что и у fetchObjectByShareToken в objectsApi.ts).
export function fetchBriefByToken(token: string): Promise<Brief> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('briefs').select('*').eq('share_token', token).single();
    if (error) throw error;
    return fromRow(data as BriefRow);
  });
}

// shareToken тут необязательный (пустая строка — не передавать вовсе,
// пусть сработает дефолт колонки) специально для insertBrief: обычно
// короткую ссылку задают уже после создания, через updateBrief, но можно
// сразу указать её и при первом сохранении.
export function insertBrief(input: Omit<Brief, 'id' | 'createdAt'>): Promise<Brief> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('briefs')
      .insert({
        object_id: input.objectId,
        recipient_name: input.recipientName || null,
        recipient_phone: input.recipientPhone || null,
        photos: input.photos,
        ...(input.shareToken.trim() ? { share_token: input.shareToken.trim() } : {}),
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as BriefRow);
  });
}

export function updateBrief(id: string, input: Omit<Brief, 'id' | 'createdAt'>): Promise<Brief> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('briefs')
      .update({
        object_id: input.objectId,
        recipient_name: input.recipientName || null,
        recipient_phone: input.recipientPhone || null,
        photos: input.photos,
        // Пустую ссылку не сохраняем — она единственный способ попасть на
        // публичную страницу, случайно затереть её в null нельзя.
        ...(input.shareToken.trim() ? { share_token: input.shareToken.trim() } : {}),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as BriefRow);
  });
}

export function deleteBrief(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('briefs').delete().eq('id', id);
    if (error) throw error;
  });
}
