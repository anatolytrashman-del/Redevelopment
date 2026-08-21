// Список ответственных больше не хардкод — берётся из таблицы people
// (см. data/people.ts, lib/peopleApi.ts), у кого выставлен флаг
// is_task_assignee. Тип поэтому обычный string, а не литеральный union.
export type TaskAssignee = string;

export interface Task {
  id: string;
  title: string;
  description: string;
  date: string;
  assignees: TaskAssignee[];
  isPriority: boolean;
  isDone: boolean;
  result: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/tasksApi.ts
export interface TaskRow {
  id: string;
  title: string;
  description: string;
  date: string;
  assignees: string[];
  is_priority: boolean;
  is_done: boolean;
  result: string;
}
