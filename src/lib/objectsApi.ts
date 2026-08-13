import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { RealtyObject, RealtyObjectRow } from '../data/objects';

function fromRow(row: RealtyObjectRow): RealtyObject {
  return {
    id: row.id,
    address: row.address,
    area: row.area,
    startPrice: row.start_price,
    photoUrl: row.photo_url ?? '',
    floorPlanUrls: row.floor_plan_urls ?? [],
    listingUrl: row.listing_url,
    owner: row.owner,
    ownerContact: row.owner_contact,
    notes: row.notes,
  };
}

export function fetchObjects(): Promise<RealtyObject[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('objects').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as RealtyObjectRow[]).map(fromRow);
  });
}

export function insertObject(input: Omit<RealtyObject, 'id'>): Promise<RealtyObject> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('objects')
      .insert({
        address: input.address,
        area: input.area,
        start_price: input.startPrice,
        photo_url: input.photoUrl || null,
        floor_plan_urls: input.floorPlanUrls,
        listing_url: input.listingUrl,
        owner: input.owner,
        owner_contact: input.ownerContact,
        notes: input.notes,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

export function updateObject(id: string, input: Omit<RealtyObject, 'id'>): Promise<RealtyObject> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('objects')
      .update({
        address: input.address,
        area: input.area,
        start_price: input.startPrice,
        photo_url: input.photoUrl || null,
        floor_plan_urls: input.floorPlanUrls,
        listing_url: input.listingUrl,
        owner: input.owner,
        owner_contact: input.ownerContact,
        notes: input.notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as RealtyObjectRow);
  });
}

export function uploadObjectImage(file: File): Promise<string> {
  return withRetry(async () => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('object-photos').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('object-photos').getPublicUrl(path);
    return data.publicUrl;
  });
}
