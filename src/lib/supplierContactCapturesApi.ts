import { supabase } from './supabase';
import { withRetry } from './withRetry';

// Контакты, снятые кликом на сайте поставщика закладкой «Снять контакт»
// (tools/menu-bookmarklet/contacts.js). Миграция
// 20260914-supplier-contact-captures.sql.
//
// Владелец, 2026-09-14: «чтобы вся верификация была на одной вкладке».
// Снятое НИКОГДА не затирает уже заполненное поле карточки — только
// подставляется в пустое, а расхождение показывается предложением
// (см. SupplierVerificationTab.tsx). Карточки поставщиков продаются с
// требованием точности 97%, молчаливая перезапись тут недопустима.
export type SupplierContactCaptureKind = 'phone' | 'email' | 'messenger';

export interface SupplierContactCapture {
  id: string;
  host: string;
  kind: SupplierContactCaptureKind;
  value: string;
  messengerType: string;
  rawText: string;
  pageUrl: string;
  // Оценка варианта: чем больше, тем вероятнее это рабочий контакт закупок
  // (ящик zakaz@/sales@ выше info@, городской номер выше 8-800). Считает
  // закладка, см. tools/menu-bookmarklet/contacts.js.
  rank: number;
  capturedAt: string;
  status: 'pending' | 'applied' | 'skipped';
  appliedAt: string | null;
  note: string;
}

interface SupplierContactCaptureRow {
  id: string;
  host: string;
  kind: string;
  value: string;
  messenger_type: string | null;
  raw_text: string | null;
  page_url: string | null;
  rank: number | null;
  captured_at: string;
  status: string | null;
  applied_at: string | null;
  note: string | null;
}

function fromRow(row: SupplierContactCaptureRow): SupplierContactCapture {
  return {
    id: row.id,
    host: row.host,
    kind: (row.kind as SupplierContactCaptureKind) ?? 'phone',
    value: row.value,
    messengerType: row.messenger_type ?? '',
    rawText: row.raw_text ?? '',
    pageUrl: row.page_url ?? '',
    rank: row.rank ?? 0,
    capturedAt: row.captured_at,
    status: (row.status as SupplierContactCapture['status']) ?? 'pending',
    appliedAt: row.applied_at,
    note: row.note ?? '',
  };
}

export function fetchSupplierContactCaptures(): Promise<SupplierContactCapture[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_contact_captures')
      .select('*')
      .eq('status', 'pending')
      .order('captured_at', { ascending: false });
    if (error) throw error;
    return (data as SupplierContactCaptureRow[]).map(fromRow);
  });
}

// Повторный клик по тому же контакту — обычное дело (промахнулась, вернулась,
// кликнула ещё раз). Уникальный индекс по host+kind+messenger_type+value
// превращает это в обновление той же строки, а не во второе предложение на
// карточке.
export function upsertSupplierContactCapture(input: {
  host: string;
  kind: SupplierContactCaptureKind;
  value: string;
  messengerType: string;
  rawText: string;
  pageUrl: string;
  rank: number;
}): Promise<SupplierContactCapture> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_contact_captures')
      .upsert(
        {
          host: input.host,
          kind: input.kind,
          value: input.value,
          messenger_type: input.messengerType,
          raw_text: input.rawText,
          page_url: input.pageUrl,
          rank: input.rank,
          status: 'pending',
          // Съём человеком — в отличие от робота (scripts/harvest.mjs).
          source: 'bookmarklet',
          captured_at: new Date().toISOString(),
        },
        { onConflict: 'host,kind,messenger_type,value' },
      )
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SupplierContactCaptureRow);
  });
}

export function markSupplierContactCapture(
  id: string,
  status: 'applied' | 'skipped',
  note = '',
): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('supplier_contact_captures')
      .update({
        status,
        note,
        applied_at: status === 'applied' ? new Date().toISOString() : null,
      })
      .eq('id', id);
    if (error) throw error;
  });
}
