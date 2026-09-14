import { supabase } from './supabase';
import { withRetry, UPLOAD_TIMEOUT_MS } from './withRetry';
import { queueImageCompression } from './tinypngCompress';
import type {
  SupplierRequest,
  SupplierRequestRow,
  SupplierRequestGroup,
  SupplierComparisonMode,
  SupplierOffer,
  SupplierOfferRow,
  ResearchContactMethod,
} from '../data/supplierResearch';
import type { DocumentFile } from '../data/contractorDocuments';
import type { Currency } from '../data/transactions';

function requestFromRow(row: SupplierRequestRow): SupplierRequest {
  return {
    id: row.id,
    title: row.title,
    group: (row.category_group as SupplierRequestGroup) || 'materials',
    estimateId: row.estimate_id,
    sectionId: row.section_id,
    sectionTitle: row.section_title ?? '',
    legalEntityId: row.legal_entity_id ?? null,
    comparisonMode: (row.comparison_mode as SupplierComparisonMode) || 'material',
    createdAt: row.created_at,
  };
}

function offerFromRow(row: SupplierOfferRow): SupplierOffer {
  return {
    id: row.id,
    requestId: row.request_id,
    name: row.name,
    contact: row.contact,
    contactMethod: row.contact_method as ResearchContactMethod,
    email: row.email ?? '',
    managerName: row.manager_name ?? '',
    country: row.country ?? '',
    websiteUrl: row.website_url,
    listingUrl: row.listing_url ?? '',
    contactSource: row.contact_source ?? '',
    messengers: Array.isArray(row.messengers) ? row.messengers : [],
    catalogModelName: row.catalog_model_name,
    catalogModelPhoto: row.catalog_model_photo,
    price: row.price,
    currency: row.currency as Currency,
    items: row.items ?? [],
    files: row.files ?? [],
    shortCode: row.short_code,
    verified: row.verified,
    inn: row.inn ?? null,
    queueSnoozedAt: row.queue_snoozed_at ?? null,
    createdAt: row.created_at,
  };
}

export function fetchSupplierRequests(): Promise<SupplierRequest[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('supplier_research_requests').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as SupplierRequestRow[]).map(requestFromRow);
  });
}

export interface SupplierRequestInput {
  title: string;
  group: SupplierRequestGroup;
  estimateId: string | null;
  sectionId: string | null;
  sectionTitle: string;
  legalEntityId: string | null;
  comparisonMode: SupplierComparisonMode;
}

export function insertSupplierRequest(input: SupplierRequestInput): Promise<SupplierRequest> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_requests')
      .insert({
        title: input.title,
        category_group: input.group,
        estimate_id: input.estimateId,
        section_id: input.sectionId,
        section_title: input.sectionTitle,
        legal_entity_id: input.legalEntityId,
        comparison_mode: input.comparisonMode,
      })
      .select()
      .single();
    if (error) throw error;
    return requestFromRow(data as SupplierRequestRow);
  });
}

export function updateSupplierRequest(id: string, input: SupplierRequestInput): Promise<SupplierRequest> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_requests')
      .update({
        title: input.title,
        category_group: input.group,
        estimate_id: input.estimateId,
        section_id: input.sectionId,
        section_title: input.sectionTitle,
        legal_entity_id: input.legalEntityId,
        comparison_mode: input.comparisonMode,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return requestFromRow(data as SupplierRequestRow);
  });
}

// Каскад на request_id (см. миграцию) сам чистит предложения этого запроса.
export function deleteSupplierRequest(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('supplier_research_requests').delete().eq('id', id);
    if (error) throw error;
  });
}

// Все предложения сразу, группировка по requestId на клиенте — тот же
// принцип, что и у fetchResearchOffers (contractorResearchApi.ts).
export type SupplierOfferInput = Omit<SupplierOffer, 'id' | 'createdAt' | 'shortCode' | 'queueSnoozedAt'>;

export function fetchSupplierOffers(): Promise<SupplierOffer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('supplier_research_offers').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as SupplierOfferRow[]).map(offerFromRow);
  });
}

// queueSnoozedAt сюда не входит намеренно: это состояние очереди, а не
// данные поставщика. Его ставит и снимает вкладка верификации целиком
// (snoozeSupplierOffers / unsnoozeAllSupplierOffers), и обычная правка
// карточки не должна ни выставлять, ни затирать его.
export function insertSupplierOffer(input: SupplierOfferInput): Promise<SupplierOffer> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_offers')
      .insert({
        request_id: input.requestId,
        name: input.name,
        contact: input.contact,
        contact_method: input.contactMethod,
        email: input.email,
        manager_name: input.managerName,
        country: input.country,
        website_url: input.websiteUrl,
        listing_url: input.listingUrl,
        messengers: input.messengers,
        catalog_model_name: input.catalogModelName,
        catalog_model_photo: input.catalogModelPhoto,
        price: input.price,
        currency: input.currency,
        items: input.items,
        files: input.files,
        verified: input.verified,
        inn: input.inn,
      })
      .select()
      .single();
    if (error) throw error;
    return offerFromRow(data as SupplierOfferRow);
  });
}

export function updateSupplierOffer(id: string, input: SupplierOfferInput): Promise<SupplierOffer> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_offers')
      .update({
        request_id: input.requestId,
        name: input.name,
        contact: input.contact,
        contact_method: input.contactMethod,
        email: input.email,
        manager_name: input.managerName,
        country: input.country,
        website_url: input.websiteUrl,
        listing_url: input.listingUrl,
        messengers: input.messengers,
        catalog_model_name: input.catalogModelName,
        catalog_model_photo: input.catalogModelPhoto,
        price: input.price,
        currency: input.currency,
        items: input.items,
        files: input.files,
        verified: input.verified,
        inn: input.inn,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return offerFromRow(data as SupplierOfferRow);
  });
}

export function deleteSupplierOffer(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('supplier_research_offers').delete().eq('id', id);
    if (error) throw error;
  });
}

// Файлы (модель в каталоге — фото, область для прикреплённых файлов) —
// тот же бакет и приём, что и у uploadObjectDocument (объекты, юрлица,
// "Авангард" и т.п.): один общий публичный бакет под произвольные файлы
// админки, заводить отдельный под поставщиков незачем.
export function uploadSupplierFile(file: File): Promise<DocumentFile> {
  return withRetry(
    async () => {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('object-documents').upload(path, file);
      if (error) throw error;
      queueImageCompression('object-documents', path);
      const { data } = supabase.storage.from('object-documents').getPublicUrl(path);
      return { url: data.publicUrl, fileName: file.name };
    },
    1500,
    UPLOAD_TIMEOUT_MS,
    3,
  );
}

// Очередь верификации целиком — «на потом» и обратно. Владелец, 2026-09-15:
// «полностью очисти очередь верификации, я пока не буду ей заниматься».
// Одним запросом, а не по карточке: их под сотню, и держать очередь
// наполовину убранной незачем.
export function snoozeSupplierOffers(ids: string[]): Promise<void> {
  return withRetry(async () => {
    if (!ids.length) return;
    const { error } = await supabase
      .from('supplier_research_offers')
      .update({ queue_snoozed_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
  });
}

export function unsnoozeAllSupplierOffers(): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('supplier_research_offers')
      .update({ queue_snoozed_at: null })
      .not('queue_snoozed_at', 'is', null);
    if (error) throw error;
  });
}
