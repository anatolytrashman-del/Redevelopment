// Смета реновации — привязана к объекту (RealtyObject), живёт отдельной
// вкладкой в админке (Estimates.tsx/EstimateDetail.tsx), в отличие от
// техзадания (Brief) не публикуется наружу — только для внутренней работы
// (руководитель строительства, потом тендер подрядчикам).
//
// Контент — разделы свободного текста (Фасад/Кабинеты/...), а не жёстко
// структурированные позиции с полями: состав работ ещё меняется по ходу
// уточнений, и текстовый блок с ручным форматированием (списки через "-",
// акценты через **жирный**) гибче, чем формы под каждое поле. Тот же
// принцип, что у RealtyObject.concept/notes — просто выросший в несколько
// именованных разделов вместо одного поля.

export interface EstimateSection {
  id: string;
  title: string;
  body: string;
}

export interface EstimateQuestion {
  id: string;
  text: string;
  resolved: boolean;
}

export interface Estimate {
  id: string;
  objectId: string;
  sections: EstimateSection[];
  questions: EstimateQuestion[];
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/estimatesApi.ts
export interface EstimateRow {
  id: string;
  object_id: string;
  sections: EstimateSection[] | null;
  questions: EstimateQuestion[] | null;
  created_at: string;
}

// Стартовый набор разделов для новой сметы — по мере работы разделы можно
// переименовывать, удалять и добавлять свои прямо на странице сметы.
export function defaultEstimateSections(): EstimateSection[] {
  return [
    { id: crypto.randomUUID(), title: 'Фасад', body: '' },
    { id: crypto.randomUUID(), title: 'Кабинеты', body: '' },
    { id: crypto.randomUUID(), title: 'Общие зоны', body: '' },
    { id: crypto.randomUUID(), title: 'Организация и логистика', body: '' },
  ];
}
