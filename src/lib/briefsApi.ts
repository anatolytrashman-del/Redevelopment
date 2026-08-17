import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { emptyBriefPhotos, type Brief, type BriefRow } from '../data/briefs';

function fromRow(row: BriefRow): Brief {
  return {
    id: row.id,
    objectId: row.object_id,
    photos: row.photos ?? emptyBriefPhotos(),
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

export function insertBrief(input: Omit<Brief, 'id' | 'createdAt' | 'shareToken'>): Promise<Brief> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('briefs')
      .insert({
        object_id: input.objectId,
        photos: input.photos,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as BriefRow);
  });
}

export function updateBrief(id: string, input: Omit<Brief, 'id' | 'createdAt' | 'shareToken'>): Promise<Brief> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('briefs')
      .update({
        object_id: input.objectId,
        photos: input.photos,
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
