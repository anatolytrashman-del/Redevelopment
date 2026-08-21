// Единый список людей внутри платформы — источник правды для того, кого
// можно назначить ответственным за задачу и кто участвует в каких ролях
// в разделе "Транзакции" (см. lib/peopleApi.ts, Tasks.tsx, Transactions.tsx).
// Раньше это были отдельные, ничем не связанные списки в data/tasks.ts и
// data/transactions.ts — один и тот же человек (например, Степан) мог быть
// в одном списке и отсутствовать в другом. Управляется напрямую в базе
// (таблица people), без своей страницы в интерфейсе — редактируется через
// Supabase Management API по просьбе владельца.
export interface Person {
  id: string;
  name: string;
  isTaskAssignee: boolean;
  isSplitPayer: boolean;
  isSoloPayer: boolean;
  isIncomePayer: boolean;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/peopleApi.ts
export interface PersonRow {
  id: string;
  name: string;
  is_task_assignee: boolean;
  is_split_payer: boolean;
  is_solo_payer: boolean;
  is_income_payer: boolean;
}
