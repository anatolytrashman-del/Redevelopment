import { supabase } from './supabase';

// Отметки «таблица изменилась» (supabase/migrations/20260924-table-change-stamps.sql):
// триггер на таблице ставит время последнего изменения, а страница, которой
// нужно держать список свежим, спрашивает эти несколько строк и перекачивает
// сам список, только если отметка сдвинулась. Так опрос раз в 20 секунд
// стоит сотню байт, а не мегабайты (бесплатный тариф Supabase — 5 ГБ в месяц).
export type ChangeStampTable =
  | 'supplier_offer_emails'
  | 'supplier_research_offers'
  | 'supplier_offer_quotes'
  | 'supplier_enrichment_jobs';

export async function fetchChangeStamps(tables: ChangeStampTable[]): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('table_change_stamps').select('table_name,changed_at').in('table_name', tables);
  if (error) throw error;
  return new Map((data ?? []).map((row: { table_name: string; changed_at: string }) => [row.table_name, row.changed_at]));
}

// Какие таблицы изменились с прошлого раза. Первый вызов только запоминает
// отметки: список только что загружен страницей целиком.
export function createChangeTracker(tables: ChangeStampTable[]) {
  let last: Map<string, string> | null = null;
  return async function changedTables(): Promise<Set<ChangeStampTable>> {
    const stamps = await fetchChangeStamps(tables);
    const changed = new Set<ChangeStampTable>();
    if (last) {
      for (const t of tables) if (stamps.get(t) !== last.get(t)) changed.add(t);
    }
    last = stamps;
    return changed;
  };
}
