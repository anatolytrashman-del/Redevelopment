import { supabase } from './supabase';
import { withRetry } from './withRetry';

// Снимки меню каталога, снятые закладкой «Снять меню» (tools/menu-bookmarklet)
// прямо со страницы поставщика. Миграция 20260914-supplier-menu-captures.sql.
//
// Дерево приходит не с сервера, а из соседней вкладки: её открыла сама
// админка, поэтому у неё есть ссылка на открывшую вкладку, и закладка шлёт
// дерево туда (см. SupplierVerificationTab.tsx, слушатель 'message').
// Владелец, 2026-09-14: «я не хочу вручную пересылать каждый раз».
export interface SupplierMenuCapture {
  id: string;
  host: string;
  pageUrl: string;
  tree: string;
  sectionsCount: number;
  capturedAt: string;
  status: 'pending' | 'applied' | 'skipped';
  appliedAt: string | null;
  note: string;
}

interface SupplierMenuCaptureRow {
  id: string;
  host: string;
  page_url: string | null;
  tree: string;
  sections_count: number | null;
  captured_at: string;
  status: string | null;
  applied_at: string | null;
  note: string | null;
}

function fromRow(row: SupplierMenuCaptureRow): SupplierMenuCapture {
  return {
    id: row.id,
    host: row.host,
    pageUrl: row.page_url ?? '',
    tree: row.tree,
    sectionsCount: row.sections_count ?? 0,
    capturedAt: row.captured_at,
    status: (row.status as SupplierMenuCapture['status']) ?? 'pending',
    appliedAt: row.applied_at,
    note: row.note ?? '',
  };
}

export function fetchSupplierMenuCaptures(): Promise<SupplierMenuCapture[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_menu_captures')
      .select('*')
      .order('captured_at', { ascending: false });
    if (error) throw error;
    return (data as SupplierMenuCaptureRow[]).map(fromRow);
  });
}

export function insertSupplierMenuCapture(input: {
  host: string;
  pageUrl: string;
  tree: string;
  sectionsCount: number;
}): Promise<SupplierMenuCapture> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_menu_captures')
      .insert({
        host: input.host,
        page_url: input.pageUrl,
        tree: input.tree,
        sections_count: input.sectionsCount,
        // Съём человеком — в отличие от робота (scripts/harvest.mjs).
        source: 'bookmarklet',
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SupplierMenuCaptureRow);
  });
}

// Только хосты, зато ВСЕ. Нужно для «второй очереди» на вкладке
// верификации: признак «сайт вообще открывали» — наличие строки здесь, и
// ошибиться в нём нельзя, иначе уже снятый поставщик уедет в ручной список.
//
// Почему отдельная функция, а не fetchSupplierMenuCaptures().map(host):
// у Supabase стоит потолок в 1000 строк на запрос (настройка Max rows), а
// снимков уже больше — полный список молча приезжал бы обрезанным. Здесь
// страницы перебираются явно, и в выборке одна короткая колонка вместо
// всего дерева разделов.
const CAPTURE_PAGE = 1000;

export function fetchSupplierMenuCaptureHosts(): Promise<Set<string>> {
  return withRetry(async () => {
    const hosts = new Set<string>();
    for (let from = 0; ; from += CAPTURE_PAGE) {
      const { data, error } = await supabase
        .from('supplier_menu_captures')
        .select('host')
        .order('host', { ascending: true })
        .range(from, from + CAPTURE_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as { host: string }[];
      for (const r of rows) hosts.add(r.host);
      if (rows.length < CAPTURE_PAGE) return hosts;
    }
  });
}
