import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Moodboard, MoodboardRow } from '../data/moodboards';

function fromRow(row: MoodboardRow): Moodboard {
  return {
    id: row.id,
    name: row.name,
    blocks: (row.blocks ?? []).map((b) => ({
      id: b.id,
      title: b.title ?? '',
      notes: b.notes ?? '',
      photoUrls: b.photoUrls ?? [],
    })),
    createdAt: row.created_at,
  };
}

export function fetchMoodboards(): Promise<Moodboard[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('moodboards').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as MoodboardRow[]).map(fromRow);
  });
}

export function fetchMoodboard(id: string): Promise<Moodboard> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('moodboards').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data as MoodboardRow);
  });
}

export function insertMoodboard(input: { name: string }): Promise<Moodboard> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('moodboards')
      .insert({ name: input.name, blocks: [] })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as MoodboardRow);
  });
}

export function updateMoodboard(id: string, input: Pick<Moodboard, 'name' | 'blocks'>): Promise<Moodboard> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('moodboards')
      .update({ name: input.name, blocks: input.blocks })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as MoodboardRow);
  });
}

export function deleteMoodboard(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('moodboards').delete().eq('id', id);
    if (error) throw error;
  });
}
