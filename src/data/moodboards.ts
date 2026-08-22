// Мудборд — набор карточек "заголовок + фото + свободный текст" на одной
// странице (перенос референс-доски дизайн-решений внутрь платформы, см.
// обсуждение в чате). В отличие от DesignProject (одна галерея фото на
// проект), у мудборда таких блоков много и они разнородные — планировка
// специально "плоская": массив блоков внутри одной записи (jsonb), без
// отдельной таблицы, как categories/sales у FinModel (data/finModels.ts) —
// блоки не нужно ни фильтровать, ни выбирать отдельным запросом.
export interface MoodboardBlock {
  id: string;
  title: string;
  notes: string;
  photoUrls: string[];
}

export interface Moodboard {
  id: string;
  name: string;
  blocks: MoodboardBlock[];
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/moodboardsApi.ts
export interface MoodboardRow {
  id: string;
  name: string;
  blocks: MoodboardBlock[] | null;
  created_at: string;
}

export function emptyMoodboardBlock(): MoodboardBlock {
  return { id: crypto.randomUUID(), title: '', notes: '', photoUrls: [] };
}
