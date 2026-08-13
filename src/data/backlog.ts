export interface BacklogIdea {
  id: string;
  idea: string;
  benefit: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/backlogApi.ts
export interface BacklogIdeaRow {
  id: string;
  idea: string;
  benefit: string;
  created_at: string;
}
