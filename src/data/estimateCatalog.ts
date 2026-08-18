// Каталог типовых позиций сметы — растущая база знаний "название работы →
// состав операций + материалы" (плитка → подготовка, гидроизоляция, укладка,
// затирка...), общая для всех объектов, не привязана к конкретной смете.
// Один раз описали позицию — дальше на любом объекте просто вставляем её в
// раздел сметы вместо того, чтобы каждый раз писать состав работ с нуля
// (см. CatalogPickerModal.tsx). Тот же принцип, что у AddableSelect-тегов
// в проекте, но с содержимым побогаче одной строки.

export interface EstimateCatalogItem {
  id: string;
  title: string;
  // Состав операций — каждая строка отдельным пунктом при вставке в раздел.
  ops: string[];
  // Материалы и нормы расхода — свободный текст (одна строка обычно
  // достаточно, но не ограничиваем).
  materials: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/estimateCatalogApi.ts
export interface EstimateCatalogItemRow {
  id: string;
  title: string;
  ops: string[] | null;
  materials: string | null;
  created_at: string;
}

// Текстовый блок для вставки позиции каталога в свободный текст раздела
// сметы (EstimateSection.body) — общий формат, чтобы вставленные блоки
// выглядели одинаково независимо от того, кто и когда их добавил.
export function formatCatalogItemForInsert(item: Pick<EstimateCatalogItem, 'title' | 'ops' | 'materials'>): string {
  const lines = [`${item.title}:`, ...item.ops.map((op) => `— ${op}`)];
  if (item.materials.trim()) lines.push(`Материалы: ${item.materials.trim()}`);
  return lines.join('\n');
}
