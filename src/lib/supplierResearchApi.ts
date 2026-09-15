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
  SupplierProposal,
  SupplierProposalReview,
} from '../data/supplierResearch';
import type { PurchaseItem } from '../data/purchases';
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
    proposal: row.proposal && typeof row.proposal === 'object' ? row.proposal : {},
    review: row.proposal_review && typeof row.proposal_review === 'object' && row.proposal_review.status ? row.proposal_review : null,
    createdAt: row.created_at,
  };
}

function offerFromRow(row: SupplierOfferRow): SupplierOffer {
  return {
    id: row.id,
    requestId: row.request_id,
    supplierId: row.supplier_id ?? null,
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
    termsNote: row.terms_note ?? '',
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
// Отбор на утверждение (SupplierRequest.proposal) хранится отдельно от
// остальной формы запроса: его меняет вкладка «Сравнение цен» по одному
// клику, и тащить туда весь SupplierRequestInput незачем.
export function updateSupplierRequestProposal(id: string, proposal: SupplierProposal): Promise<SupplierRequest> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_requests')
      .update({ proposal })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return requestFromRow(data as SupplierRequestRow);
  });
}

// Стадия согласования (см. SupplierProposalReview) — отдельным одноколоночным
// апдейтом по той же причине, что и proposal выше.
export function updateSupplierRequestReview(id: string, review: SupplierProposalReview | null): Promise<SupplierRequest> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_requests')
      .update({ proposal_review: review })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return requestFromRow(data as SupplierRequestRow);
  });
}

// Привязка раздела сметы к категории одним кликом из «Сравнения цен»
// (владелец, 2026-09-15: у плинтусов раздел в смете был, а к категории не
// привязан — страница показывала «раздел не выбран» при пяти КП на руках).
export function updateSupplierRequestSection(
  id: string,
  input: { estimateId: string | null; sectionId: string | null; sectionTitle: string },
): Promise<SupplierRequest> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_requests')
      .update({ estimate_id: input.estimateId, section_id: input.sectionId, section_title: input.sectionTitle })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return requestFromRow(data as SupplierRequestRow);
  });
}

// ВНИМАНИЕ: в отличие от deleteSupplierOffer ниже, это по-прежнему ФИЗИЧЕСКОЕ
// удаление, и FK ON DELETE CASCADE утащит за запросом все его карточки
// поставщиков со всей перепиской, КП и заданиями рассылки. Сейчас это
// безопасно ровно потому, что из интерфейса функция не вызывается ни разу
// (проверено grep'ом 2026-09-15) — запросы удаляются только руками через SQL.
// Прежде чем повесить её на кнопку, перевести на мягкое удаление так же, как
// deleteSupplierOffer.
export function deleteSupplierRequest(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('supplier_research_requests').delete().eq('id', id);
    if (error) throw error;
  });
}

// Все предложения сразу, группировка по requestId на клиенте — тот же
// принцип, что и у fetchResearchOffers (contractorResearchApi.ts).
export type SupplierOfferInput = Omit<SupplierOffer, 'id' | 'createdAt' | 'shortCode' | 'queueSnoozedAt'>;

// `is('deleted_at', null)` — мягко удалённые карточки (см. deleteSupplierOffer
// ниже и миграцию 20260915-soft-delete-supplier-data.sql) в приложение не
// попадают вообще: ни в каталог, ни в сравнение, ни в рассылку, которая
// собирает адресатов из этого же списка.
//
// Постраничная выборка обязательна: PostgREST в настройках проекта отдаёт
// максимум 1000 строк (max_rows), а живых карточек 1141 и число растёт. До
// 2026-09-15 запрос шёл одной страницей и МОЛЧА терял хвост — 141 карточка
// просто не существовала для приложения: её не было ни в каталоге, ни в
// сравнении цен, ни в списке адресатов рассылки, и никакой ошибки при этом
// не показывалось. Сортировка по id, а не по created_at: даты у карточек
// одного импорта совпадают, и при неустойчивом порядке соседние страницы
// вернули бы одну строку дважды, потеряв другую.
const OFFERS_PAGE_SIZE = 1000;

export function fetchSupplierOffers(): Promise<SupplierOffer[]> {
  return withRetry(async () => {
    const { count, error: countError } = await supabase
      .from('supplier_research_offers')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (countError) throw countError;

    const total = count ?? 0;
    if (total === 0) return [];

    const pageStarts: number[] = [];
    for (let from = 0; from < total; from += OFFERS_PAGE_SIZE) pageStarts.push(from);

    const pages = await Promise.all(
      pageStarts.map(async (from) => {
        const { data, error } = await supabase
          .from('supplier_research_offers')
          .select('*')
          .is('deleted_at', null)
          .order('id')
          .range(from, from + OFFERS_PAGE_SIZE - 1);
        if (error) throw error;
        return (data as SupplierOfferRow[]).map(offerFromRow);
      }),
    );
    // Порядок «сначала старые» сохраняем: на него опирается остальной код
    // (первая карточка поставщика в категории, порядок в списках).
    return pages.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

// queueSnoozedAt сюда не входит намеренно: это состояние очереди, а не
// данные поставщика. Его ставит и снимает вкладка верификации целиком
// (snoozeSupplierOffers / unsnoozeAllSupplierOffers), и обычная правка
// карточки не должна ни выставлять, ни затирать его.
// Карточки одной компании — для страницы поставщика (/admin/suppliers/:id).
// Отдельный запрос, а не фильтр по общему списку: страница открывается по
// прямой ссылке, и тянуть ради неё все 1141 карточку незачем. Компания
// участвует в закупке столькими карточками, во скольких категориях ей
// писали, — это и есть её история участия.
export function fetchSupplierOffersByCompany(supplierId: string): Promise<SupplierOffer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_research_offers')
      .select('*')
      .eq('supplier_id', supplierId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as SupplierOfferRow[]).map(offerFromRow);
  });
}

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
        terms_note: input.termsNote ?? null,
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
        // См. SupplierOffer.termsNote: пишем только когда поле передано.
        ...(input.termsNote !== undefined ? { terms_note: input.termsNote } : {}),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return offerFromRow(data as SupplierOfferRow);
  });
}

// Только позиции карточки — для сопоставления строки счёта прямо из
// таблицы сравнения (те же объекты с теми же id лежат и в КП, см.
// updateSupplierQuoteItems: править нужно оба списка).
export function updateSupplierOfferItems(id: string, items: PurchaseItem[]): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('supplier_research_offers').update({ items }).eq('id', id);
    if (error) throw error;
  });
}

// Мягкое удаление вместо DELETE (шаг 1 плана закупок, §7 аудита). Физический
// DELETE здесь утаскивал каскадом всю переписку с поставщиком, все его КП,
// заявки и позиции рассылки (FK ON DELETE CASCADE, см. шапку миграции
// 20260915-soft-delete-supplier-data.sql). Снимков базы на бесплатном плане
// Supabase нет, так что восстановить это было нечем. Теперь строка остаётся в
// базе с меткой времени, а из интерфейса пропадает — вернуть карточку можно
// одним UPDATE в SQL.
export function deleteSupplierOffer(id: string): Promise<void> {
  return withRetry(async () => {
    const deletedAt = new Date().toISOString();
    const { error } = await supabase
      .from('supplier_research_offers')
      .update({ deleted_at: deletedAt })
      .eq('id', id);
    if (error) throw error;

    // Тем же движением помечаем переписку и КП этой карточки — чтобы вкладка
    // «Переписка» и сравнение цен вели себя ровно как раньше (после удаления
    // поставщика его писем и КП там не видно), но данные при этом никуда не
    // делись. Восстановление карточки = снять метку во всех трёх таблицах по
    // одному и тому же deleted_at.
    const [emailsRes, quotesRes] = await Promise.all([
      supabase.from('supplier_offer_emails').update({ deleted_at: deletedAt }).eq('offer_id', id).is('deleted_at', null),
      supabase.from('supplier_offer_quotes').update({ deleted_at: deletedAt }).eq('offer_id', id).is('deleted_at', null),
    ]);
    if (emailsRes.error) throw emailsRes.error;
    if (quotesRes.error) throw quotesRes.error;
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
