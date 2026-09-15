import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  SupplierSiteSection,
  SupplierSiteSnapshot,
  SupplierSiteSnapshotRow,
  SupplierSiteSnapshotStatus,
} from '../data/supplierSiteSnapshots';

// Только чтение: снимки создаёт триггер в базе, заполняет Edge Function,
// классифицирует сессия Claude Code (см. data/supplierSiteSnapshots.ts).
// Админке нужны товарные группы на карточке и в поиске по поставщикам.

const STATUSES: SupplierSiteSnapshotStatus[] = ['pending', 'processing', 'done', 'error'];

function fromRow(row: SupplierSiteSnapshotRow): SupplierSiteSnapshot {
  const sections: SupplierSiteSection[] = Array.isArray(row.sections)
    ? row.sections
        .filter((s): s is { title: string; url: string } => !!s && typeof s === 'object' && typeof (s as { title?: unknown }).title === 'string')
        .map((s) => ({ title: s.title, url: typeof s.url === 'string' ? s.url : '' }))
    : [];
  return {
    host: row.host,
    websiteUrl: row.website_url,
    status: STATUSES.includes(row.status as SupplierSiteSnapshotStatus) ? (row.status as SupplierSiteSnapshotStatus) : 'pending',
    pageTitle: row.page_title ?? '',
    metaDescription: row.meta_description ?? '',
    sections,
    error: row.error,
    fetchedAt: row.fetched_at,
    categories: Array.isArray(row.categories) ? row.categories.filter((c) => typeof c === 'string' && c.trim()) : [],
    categoriesNote: row.categories_note ?? '',
    classifiedAt: row.classified_at,
    categoriesVerified: row.categories_verified === true,
    categoriesVerifiedAt: row.categories_verified_at,
  };
}

// Без home_text: он нужен только классификатору, а на 259+ доменов это
// ~700 КБ лишнего трафика при каждом открытии страницы поставщиков.
const COLUMNS =
  'host, website_url, status, page_title, meta_description, sections, error, fetched_at, categories, categories_note, classified_at, categories_verified, categories_verified_at';

// Постраничная выборка по той же причине, что у карточек поставщиков (см.
// fetchSupplierOffers): PostgREST отдаёт максимум 1000 строк, а снимков 1393.
// Одностраничный запрос молча обрезал хвост по алфавиту хостов — у доменов
// после тысячного товарные группы в каталоге просто не показывались, и
// выглядело это не как ошибка, а как «сайт ещё не разобран».
const SNAPSHOTS_PAGE_SIZE = 1000;

export function fetchSupplierSiteSnapshots(): Promise<SupplierSiteSnapshot[]> {
  return withRetry(async () => {
    const { count, error: countError } = await supabase
      .from('supplier_site_snapshots')
      .select('host', { count: 'exact', head: true });
    if (countError) throw countError;

    const total = count ?? 0;
    if (total === 0) return [];

    const pageStarts: number[] = [];
    for (let from = 0; from < total; from += SNAPSHOTS_PAGE_SIZE) pageStarts.push(from);

    const pages = await Promise.all(
      pageStarts.map(async (from) => {
        const { data, error } = await supabase
          .from('supplier_site_snapshots')
          .select(COLUMNS)
          .order('host', { ascending: true })
          .range(from, from + SNAPSHOTS_PAGE_SIZE - 1);
        if (error) throw error;
        return ((data ?? []) as unknown as SupplierSiteSnapshotRow[]).map(fromRow);
      }),
    );
    return pages.flat();
  });
}

// Перечитать сайт заново: ставим снимок обратно в очередь, дальше его
// разберёт Edge Function process-supplier-jobs (крон раз в минуту). Строка на
// домен одна, поэтому именно update, а не вставка новой; upsert на случай,
// когда домена в таблице ещё нет вовсе (компанию завели руками).
export function requestSiteSnapshotRefresh(host: string, websiteUrl: string): Promise<void> {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return Promise.resolve();
  return withRetry(async () => {
    const { error } = await supabase
      .from('supplier_site_snapshots')
      .upsert(
        // attempts сбрасываем: счётчик неудач копится по домену, и без сброса
        // сайт, который раньше не открывался, снова упал бы в 'error' с первой
        // же осечки, хотя человек попросил перечитать его заново.
        { host: normalized, website_url: websiteUrl, status: 'pending', claimed_at: null, error: null, attempts: 0 },
        { onConflict: 'host' },
      );
    if (error) throw error;
  });
}

// Снимок одного домена — для страницы компании, где грузить все 1393 строки
// незачем. Пустой host (компания без сайта) до запроса не доходит.
export function fetchSupplierSiteSnapshot(host: string): Promise<SupplierSiteSnapshot | null> {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return Promise.resolve(null);
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_site_snapshots')
      .select(COLUMNS)
      .eq('host', normalized)
      .maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as unknown as SupplierSiteSnapshotRow) : null;
  });
}
