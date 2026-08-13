export interface ObjectComment {
  id: string;
  objectId: string;
  text: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/objectCommentsApi.ts
export interface ObjectCommentRow {
  id: string;
  object_id: string;
  text: string;
  created_at: string;
}
