import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { SupplierContact, SupplierContactRow } from '../data/supplierContacts';

// Контактные лица одной компании (шаг 3b плана закупок). Шаблон тот же, что у
// leads.ts/leadsApi.ts. Выборка всегда по конкретной компании: контактов в
// базе больше тысячи, а нужны они только на её странице.

function fromRow(row: SupplierContactRow): SupplierContact {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name ?? '',
    role: row.role ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    messengers: row.messengers ?? [],
    source: row.source ?? '',
    lastReplyAt: row.last_reply_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export type SupplierContactInput = Pick<SupplierContact, 'name' | 'role' | 'phone' | 'email' | 'messengers'>;

function toRow(input: SupplierContactInput) {
  return {
    name: input.name.trim(),
    role: input.role.trim(),
    phone: input.phone.trim(),
    // Адрес в нижнем регистре: по нему стоит уникальный индекс внутри
    // компании, и триггер на входящих письмах нормализует так же. Иначе
    // «Ivanov@» из формы и «ivanov@» из письма стали бы двумя людьми.
    email: input.email.trim().toLowerCase(),
    messengers: input.messengers,
  };
}

export function fetchSupplierContacts(supplierId: string): Promise<SupplierContact[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_contacts')
      .select('*')
      .eq('supplier_id', supplierId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as SupplierContactRow[]).map(fromRow);
  });
}

export function insertSupplierContact(supplierId: string, input: SupplierContactInput): Promise<SupplierContact> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_contacts')
      .insert({ supplier_id: supplierId, source: 'вручную', ...toRow(input) })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SupplierContactRow);
  });
}

export function updateSupplierContact(id: string, input: SupplierContactInput): Promise<SupplierContact> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('supplier_contacts').update(toRow(input)).eq('id', id).select().single();
    if (error) throw error;
    return fromRow(data as SupplierContactRow);
  });
}

// Мягкое удаление, как везде в модуле закупок (шаг 1): человек пропадает из
// списка, но строка остаётся — вместе с датой его последнего ответа, которая
// иначе восстановлению не подлежит. Если он напишет снова, триггер на
// входящих письмах НЕ воскресит эту строку, а заведёт новую: уникальный
// индекс по адресу считает только живые записи.
export function deleteSupplierContact(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('supplier_contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}
