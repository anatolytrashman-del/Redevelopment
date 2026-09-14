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
