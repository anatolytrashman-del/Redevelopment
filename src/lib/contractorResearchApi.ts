import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  ResearchRequest,
  ResearchRequestRow,
  ResearchOffer,
  ResearchOfferRow,
  ResearchContactMethod,
} from '../data/contractorResearch';
import type { Currency } from '../data/transactions';

function requestFromRow(row: ResearchRequestRow): ResearchRequest {
  return { id: row.id, title: row.title, createdAt: row.created_at };
}

function offerFromRow(row: ResearchOfferRow): ResearchOffer {
  return {
    id: row.id,
    requestId: row.request_id,
    name: row.name,
    contact: row.contact,
    contactMethod: row.contact_method as ResearchContactMethod,
    price: row.price,
    currency: row.currency as Currency,
    deadline: row.deadline,
    requirements: row.requirements,
    createdAt: row.created_at,
  };
}

export function fetchResearchRequests(): Promise<ResearchRequest[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('contractor_research_requests').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as ResearchRequestRow[]).map(requestFromRow);
  });
}

export function insertResearchRequest(title: string): Promise<ResearchRequest> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('contractor_research_requests').insert({ title }).select().single();
    if (error) throw error;
    return requestFromRow(data as ResearchRequestRow);
  });
}

export function updateResearchRequest(id: string, title: string): Promise<ResearchRequest> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contractor_research_requests')
      .update({ title })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return requestFromRow(data as ResearchRequestRow);
  });
}

// Каскад на request_id (см. миграцию) сам чистит предложения этого запроса.
export function deleteResearchRequest(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('contractor_research_requests').delete().eq('id', id);
    if (error) throw error;
  });
}

// Все предложения сразу, не по одному запросу — масштаб небольшой (ручной
// ресерч владельца, не поток объявлений), группировка по requestId на
// клиенте (см. ContractorsResearch.tsx), как и у похожих списков в проекте.
export function fetchResearchOffers(): Promise<ResearchOffer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('contractor_research_offers').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as ResearchOfferRow[]).map(offerFromRow);
  });
}

export function insertResearchOffer(input: Omit<ResearchOffer, 'id' | 'createdAt'>): Promise<ResearchOffer> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contractor_research_offers')
      .insert({
        request_id: input.requestId,
        name: input.name,
        contact: input.contact,
        contact_method: input.contactMethod,
        price: input.price,
        currency: input.currency,
        deadline: input.deadline,
        requirements: input.requirements,
      })
      .select()
      .single();
    if (error) throw error;
    return offerFromRow(data as ResearchOfferRow);
  });
}

export function updateResearchOffer(id: string, input: Omit<ResearchOffer, 'id' | 'createdAt'>): Promise<ResearchOffer> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contractor_research_offers')
      .update({
        request_id: input.requestId,
        name: input.name,
        contact: input.contact,
        contact_method: input.contactMethod,
        price: input.price,
        currency: input.currency,
        deadline: input.deadline,
        requirements: input.requirements,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return offerFromRow(data as ResearchOfferRow);
  });
}

export function deleteResearchOffer(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('contractor_research_offers').delete().eq('id', id);
    if (error) throw error;
  });
}
