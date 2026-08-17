import { supabase } from './supabase';
import { withRetry, UPLOAD_TIMEOUT_MS } from './withRetry';
import type { Pledge, PledgeRow } from '../data/pledges';

const PLEDGE_PHOTOS_BUCKET = 'pledge-photos';
// Час — тот же TTL, что и у lead-photos/contractor-photos.
const PHOTO_URL_TTL_SECONDS = 60 * 60;

function fromRow(row: PledgeRow): Pledge {
  return {
    id: row.id,
    address: row.address,
    propertyType: row.property_type ?? '',
    area: row.area,
    marketValue: row.market_value,
    pledgeValue: row.pledge_value,
    rentalIncome: row.rental_income,
    photoPaths: row.photo_paths ?? [],
    createdAt: row.created_at,
  };
}

export function fetchPledges(): Promise<Pledge[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('pledges').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as PledgeRow[]).map(fromRow);
  });
}

export function insertPledge(input: Omit<Pledge, 'id' | 'createdAt'>): Promise<Pledge> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('pledges')
      .insert({
        address: input.address,
        property_type: input.propertyType || null,
        area: input.area,
        market_value: input.marketValue,
        pledge_value: input.pledgeValue,
        rental_income: input.rentalIncome,
        photo_paths: input.photoPaths,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as PledgeRow);
  });
}

export function updatePledge(id: string, input: Omit<Pledge, 'id' | 'createdAt'>): Promise<Pledge> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('pledges')
      .update({
        address: input.address,
        property_type: input.propertyType || null,
        area: input.area,
        market_value: input.marketValue,
        pledge_value: input.pledgeValue,
        rental_income: input.rentalIncome,
        photo_paths: input.photoPaths,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as PledgeRow);
  });
}

export function deletePledge(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('pledges').delete().eq('id', id);
    if (error) throw error;
  });
}

// Фото залога — тот же паттерн, что и у лидов/подрядчиков (закрытый бакет,
// путь а не URL в базе, подписанная ссылка на каждый показ). См. подробный
// комментарий у uploadLeadPhoto/createLeadPhotoUrl в leadsApi.ts.
export function uploadPledgePhoto(file: File): Promise<string> {
  return withRetry(
    async () => {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(PLEDGE_PHOTOS_BUCKET).upload(path, file);
      if (error) throw error;
      return path;
    },
    1000,
    UPLOAD_TIMEOUT_MS,
  );
}

export async function createPledgePhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(PLEDGE_PHOTOS_BUCKET)
      .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function deletePledgePhoto(path: string): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(PLEDGE_PHOTOS_BUCKET).remove([path]);
  } catch {
    // намеренно молча
  }
}
