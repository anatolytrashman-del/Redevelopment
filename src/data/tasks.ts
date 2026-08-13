export const taskAssignees = ['Трэшмен', 'Степа', 'Татьяна Давыдчик', 'Светлана'] as const;
export type TaskAssignee = (typeof taskAssignees)[number];

export interface Task {
  id: string;
  title: string;
  description: string;
  date: string;
  assignees: TaskAssignee[];
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
  is_done: boolean;
  result: string;
}
