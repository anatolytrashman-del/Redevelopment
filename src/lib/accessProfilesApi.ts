import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { AccessProfile, AccessProfileRow } from '../data/accessProfiles';

function fromRow(row: AccessProfileRow): AccessProfile {
  return {
    id: row.id,
    password: row.password,
    displayName: row.display_name,
    pages: row.pages,
  };
}

export function fetchAccessProfiles(): Promise<AccessProfile[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('access_profiles').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as AccessProfileRow[]).map(fromRow);
  });
}

export function insertAccessProfile(input: Omit<AccessProfile, 'id'>): Promise<AccessProfile> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('access_profiles')
      .insert({ password: input.password, display_name: input.displayName, pages: input.pages })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as AccessProfileRow);
  });
}

export function updateAccessProfile(id: string, input: Omit<AccessProfile, 'id'>): Promise<AccessProfile> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('access_profiles')
      .update({ password: input.password, display_name: input.displayName, pages: input.pages })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as AccessProfileRow);
  });
}

export function deleteAccessProfile(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('access_profiles').delete().eq('id', id);
    if (error) throw error;
  });
}
