import { supabase } from './supabase';
import { withRetry } from './withRetry';

// Справочник товарных групп из базы (таблица supply_categories, миграция
// 20260914-supplier-screenshots-and-dictionary.sql). Владелец, 2026-09-14:
// при тысяче поставщиков новые группы находятся постоянно, а каждая новая
// группа в коде — это коммит и ожидание публикации очереди релиза; до неё
// группа видна чипом на карточке, но своей плитки в каталоге не получает.
//
// Файл src/data/supplyCategories.ts остаётся сидом (его заливает в базу
// scripts/supply-categories/dictionary.mjs sync) и базой по умолчанию:
// каталог складывает группы из кода и из базы, а не заменяет одно другим.
// Поэтому недоступная база = каталог ровно такой, каким был до этой правки,
// а не пустой.
export interface SupplyCategoryDto {
  name: string;
  hint: string;
  // Имя плитки в SUPPLIER_CATALOG, куда группа попадает. Пусто — группа
  // есть, но плитки у неё пока нет (видна только чипом на карточке).
  tile: string;
  // 'seed' — приехала из файла-справочника, 'found' — найдена при
  // верификации живого поставщика.
  source: string;
  note: string;
}

interface SupplyCategoryRow {
  name: string;
  hint: string | null;
  tile: string | null;
  source: string | null;
  note: string | null;
}

export function fetchSupplyCategories(): Promise<SupplyCategoryDto[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supply_categories')
      .select('name, hint, tile, source, note')
      .order('sort', { ascending: true });
    if (error) throw error;
    return (data as SupplyCategoryRow[]).map((r) => ({
      name: r.name,
      hint: r.hint ?? '',
      tile: r.tile ?? '',
      source: r.source ?? 'seed',
      note: r.note ?? '',
    }));
  });
}
