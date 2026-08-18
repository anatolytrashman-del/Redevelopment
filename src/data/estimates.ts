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

// Ссылка на конкретный товар/материал — "Дверь", "Замок" и т.п., каждая со
// своим фото и ссылкой на источник (магазин/каталог поставщика). Тот же
// принцип, что у PhotoChange.referenceImageUrl/referenceUrl в техзадании
// (data/briefs.ts), но здесь может быть несколько референсов на одну
// позицию сразу (дверь + замок), а не один на правку.
export interface EstimateProductRef {
  id: string;
  label: string;
  photoUrl: string;
  link: string;
}

// Структурированная позиция сметы — "Замена входных дверей" и т.п.: состав
// работ + референсы на конкретные товары. В отличие от EstimateSection.body
// (свободный текст) — жёсткая форма для позиций, где уже понятен состав
// полей. Разделы переводятся на позиции постепенно, по одному — старые
// разделы продолжают жить как body, пока до них не дойдёт очередь.
export interface EstimatePosition {
  id: string;
  title: string;
  // Состав работ — каждый пункт с новой строки, показывается списком под
  // вступительной фразой POSITION_OPS_INTRO + фиксированной оговоркой
  // POSITION_OPS_CATCHALL последним пунктом (см. EstimatePositionCard.tsx).
  ops: string[];
  products: EstimateProductRef[];
}

export const POSITION_OPS_INTRO = 'Цена за работу включает следующие работы:';
export const POSITION_OPS_CATCHALL =
  'В том числе все прочие работы, предполагающие выполнение работы, но не включенные в перечень';

export interface EstimateSection {
  id: string;
  title: string;
  body: string;
  positions: EstimatePosition[];
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
    { id: crypto.randomUUID(), title: 'Фасад', body: '', positions: [] },
    { id: crypto.randomUUID(), title: 'Кабинеты', body: '', positions: [] },
    { id: crypto.randomUUID(), title: 'Общие зоны', body: '', positions: [] },
    { id: crypto.randomUUID(), title: 'Организация и логистика', body: '', positions: [] },
  ];
}
