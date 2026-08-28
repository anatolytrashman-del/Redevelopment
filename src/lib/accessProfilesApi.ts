import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { AccessProfile, AccessProfileRow } from '../data/accessProfiles';

function fromRow(row: AccessProfileRow): AccessProfile {
  return {
    id: row.id,
    userId: row.user_id,
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

// Новый профиль отсюда не завести — RLS требует существующего user_id
// (auth.users), а создание Supabase Auth аккаунта требует service_role,
// которого на фронте нет и быть не должно. Новый сотрудник — сначала
// заводится Auth-аккаунт (вручную, через Supabase Management API), потом
// строка access_profiles с готовым user_id (тоже вручную, одноразово) —
// после этого её display_name/pages уже редактируются здесь как обычно.
// isSuperAdmin по тем же причинам, что и раньше, тоже не в этой форме —
// её меняют только прямой SQL-правкой.
export function updateAccessProfile(id: string, input: Omit<AccessProfile, 'id' | 'userId' | 'isSuperAdmin'>): Promise<AccessProfile> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('access_profiles')
      .update({ display_name: input.displayName, pages: input.pages })
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
