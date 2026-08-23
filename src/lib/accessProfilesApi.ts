import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { AccessProfile, AccessProfileRow } from '../data/accessProfiles';

function fromRow(row: AccessProfileRow): AccessProfile {
  return {
    id: row.id,
    password: row.password,
    displayName: row.display_name,
    pages: row.pages,
    isSuperAdmin: row.is_super_admin,
  };
}

export function fetchAccessProfiles(): Promise<AccessProfile[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('access_profiles').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as AccessProfileRow[]).map(fromRow);
  });
}

// isSuperAdmin сознательно исключён из входа этих двух функций — форма
// профилей в /admin/settings его не редактирует (см. AccessProfile в
// data/accessProfiles.ts): она доступна и Степану, и Светлане (оба видят
// "Настройки"), а супер-доступ должен оставаться только у владельца.
// Значение в БД меняется исключительно прямой SQL-правкой.
export function insertAccessProfile(input: Omit<AccessProfile, 'id' | 'isSuperAdmin'>): Promise<AccessProfile> {
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

export function updateAccessProfile(id: string, input: Omit<AccessProfile, 'id' | 'isSuperAdmin'>): Promise<AccessProfile> {
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
