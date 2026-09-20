import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { FavoriteList, FavoriteListRow } from '../data/favorites';

function fromRow(row: FavoriteListRow): FavoriteList {
  return { id: row.id, slugs: row.slugs ?? [], createdAt: row.created_at };
}

export function fetchFavoriteList(id: string): Promise<FavoriteList | null> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('favorite_lists').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as FavoriteListRow) : null;
  });
}

export function createFavoriteList(slugs: string[]): Promise<FavoriteList> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('favorite_lists').insert({ slugs }).select('*').single();
    if (error) throw error;
    return fromRow(data as FavoriteListRow);
  });
}

export function updateFavoriteListSlugs(id: string, slugs: string[]): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('favorite_lists').update({ slugs }).eq('id', id);
    if (error) throw error;
  });
}
