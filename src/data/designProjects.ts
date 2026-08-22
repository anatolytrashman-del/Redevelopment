// Дизайн-проекты — референсы/материалы по дизайну помещений (не привязаны
// к конкретному объекту недвижимости, отдельный самостоятельный раздел).
// Карточка = название + свободные заметки + галерея фото (загружаются в
// публичный бакет design-project-photos, см. lib/designProjectsApi.ts).
export interface DesignProject {
  id: string;
  name: string;
  notes: string;
  photoUrls: string[];
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/designProjectsApi.ts
export interface DesignProjectRow {
  id: string;
  name: string;
  notes: string | null;
  photo_urls: string[] | null;
  created_at: string;
}
