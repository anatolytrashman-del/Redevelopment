export interface BacklogIdea {
  id: string;
  idea: string;
  benefit: string;
  implemented: boolean;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/backlogApi.ts
export interface BacklogIdeaRow {
  id: string;
  idea: string;
  benefit: string;
  implemented: boolean | null;
  created_at: string;
}
