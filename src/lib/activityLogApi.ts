import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { getCurrentProfile } from './accessProfile';
import type { ActivityLogEntry, ActivityLogRow } from '../data/activityLog';

function fromRow(row: ActivityLogRow): ActivityLogEntry {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    action: row.action,
    createdAt: row.created_at,
  };
}

export function fetchActivityLog(): Promise<ActivityLogEntry[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000); // страница не рассчитана на бесконечную историю — этого хватит на годы вперёд
    if (error) throw error;
    return (data as ActivityLogRow[]).map(fromRow);
  });
}

// Пишет молча, без withRetry и без ожидания вызывающим кодом — сбой
// логирования не должен мешать основному действию (например сохранению
// карточки верификации) и не должен показывать пользователю ошибку.
// Повтор через withRetry тут и не нужен: неудачная попытка просто теряет
// одну запись статистики, что не критично, а слепой повтор рисковал бы
// задвоить счётчик, если первая попытка на деле долетела.
export function logActivity(action: string): void {
  const profile = getCurrentProfile();
  supabase
    .from('activity_log')
    .insert({ profile_id: profile.id, profile_name: profile.displayName, action })
    .then(({ error }) => {
      if (error) console.error('activity_log: не удалось записать действие', error);
    });
}
