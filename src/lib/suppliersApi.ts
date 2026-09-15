import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Supplier, SupplierRow } from '../data/suppliers';

// Доступ к компаниям-поставщикам (шаг 2 плана docs/procurement-product-steps.md).
// Шаблон тот же, что у leads.ts/leadsApi.ts: fromRow + fetch/insert/update/delete,
// каждый запрос через withRetry.

// Компаний уже больше тысячи (1129 на момент бэкфилла), а PostgREST в
// настройках проекта отдаёт максимум 1000 строк за запрос — без постраничной
// выборки список молча обрезался бы, и часть компаний просто перестала бы
// существовать для приложения. Тот же приём, что в primaryMarketOffersApi.ts.
const PAGE_SIZE = 1000;

function fromRow(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    websiteHost: row.website_host ?? '',
    websiteUrl: row.website_url ?? '',
    inn: row.inn,
    country: row.country ?? '',
    city: row.city ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    messengers: row.messengers ?? [],
    termsNote: row.terms_note ?? '',
    verified: row.verified,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    blockedReason: row.blocked_reason,
    blockedAt: row.blocked_at,
  };
}

export type SupplierInput = Omit<Supplier, 'id' | 'createdAt' | 'deletedAt' | 'blockedReason' | 'blockedAt'>;

function toRow(input: SupplierInput) {
  return {
    name: input.name,
    // Пустой домен пишем как NULL, а не пустой строкой: уникальный индекс по
    // website_host считает NULL'ы разными, и компании без сайта не конфликтуют
    // между собой, тогда как две пустые строки конфликтовали бы.
    website_host: input.websiteHost.trim() || null,
    website_url: input.websiteUrl,
    inn: (input.inn ?? '').trim() || null,
    country: input.country,
    city: input.city,
    email: input.email,
    phone: input.phone,
    messengers: input.messengers,
    terms_note: input.termsNote,
    verified: input.verified,
  };
}

export function fetchSuppliers(): Promise<Supplier[]> {
  return withRetry(async () => {
    const { count, error: countError } = await supabase
      .from('suppliers')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (countError) throw countError;

    const total = count ?? 0;
    if (total === 0) return [];

    const pageStarts: number[] = [];
    for (let from = 0; from < total; from += PAGE_SIZE) pageStarts.push(from);

    const pages = await Promise.all(
      pageStarts.map(async (from) => {
        const { data, error } = await supabase
          .from('suppliers')
          .select('*')
          .is('deleted_at', null)
          // Сортировка по id, а не по created_at: у бэкфилла даты совпадают с
          // точностью до карточки-донора, и при неустойчивом порядке соседние
          // страницы могли бы вернуть одну и ту же строку дважды, потеряв другую.
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        return (data as SupplierRow[]).map(fromRow);
      }),
    );
    return pages.flat();
  });
}

// Стоп-лист: причина непуста — компании больше не пишем. Снятие — reason=null.
// Дата ставится и снимается вместе с причиной, чтобы не остаться с «когда-то
// блокировали, но уже нет» в данных.
export function setSupplierBlocked(id: string, reason: string | null): Promise<Supplier> {
  return withRetry(async () => {
    const trimmed = (reason ?? '').trim();
    const { data, error } = await supabase
      .from('suppliers')
      .update({
        blocked_reason: trimmed || null,
        blocked_at: trimmed ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SupplierRow);
  });
}

// Только идентификаторы заблокированных — для фильтра рассылки. Отдельная
// лёгкая выборка: тянуть ради этого все 1129 компаний в модалку рассылки
// незачем, а заблокированных всегда меньшинство.
export function fetchBlockedSupplierIds(): Promise<Set<string>> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id')
      .is('deleted_at', null)
      .not('blocked_reason', 'is', null);
    if (error) throw error;
    return new Set((data as { id: string }[]).map((r) => r.id));
  });
}

export function fetchSupplier(id: string): Promise<Supplier | null> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as SupplierRow) : null;
  });
}

export function insertSupplier(input: SupplierInput): Promise<Supplier> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('suppliers').insert(toRow(input)).select().single();
    if (error) throw error;
    return fromRow(data as SupplierRow);
  });
}

export function updateSupplier(id: string, input: SupplierInput): Promise<Supplier> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('suppliers').update(toRow(input)).eq('id', id).select().single();
    if (error) throw error;
    return fromRow(data as SupplierRow);
  });
}

// Мягкое удаление, как у карточек и КП (шаг 1 плана): компания пропадает из
// выборок, но её строка и всё, что на неё ссылается, остаются. Сами карточки
// при этом НЕ удаляются — внешний ключ стоит на ON DELETE SET NULL именно
// затем, чтобы переписка не зависела от судьбы записи о компании.
export function deleteSupplier(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('suppliers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}
