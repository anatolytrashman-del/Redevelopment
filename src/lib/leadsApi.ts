import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Lead, LeadRow } from '../data/leads';

function fromRow(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    source: row.source as Lead['source'],
    businessType: row.business_type,
    area: row.area,
    requirement: row.requirement,
    contact: row.contact,
    contactMethod: row.contact_method ?? '',
    phone: row.phone ?? '',
    clientType: row.client_type ?? '',
    status: row.status,
    isWarm: row.is_warm,
    objectId: row.object_id ?? '',
    createdAt: row.created_at,
    lastContactedAt: row.last_contacted_at ?? '',
  };
}

export function fetchLeads(): Promise<Lead[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as LeadRow[]).map(fromRow);
  });
}

// Для бейджа непрочитанных лидов в сайдбаре — тот же паттерн, что и у
// "Предложить идею" (см. fetchBacklogUnreadCount в backlogApi.ts).
export function fetchLeadsUnreadCount(sinceIso: string): Promise<number> {
  return withRetry(async () => {
    const { count, error } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', sinceIso);
    if (error) throw error;
    return count ?? 0;
  });
}

export function fetchLeadsForObject(objectId: string): Promise<Lead[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('object_id', objectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as LeadRow[]).map(fromRow);
  });
}

export function insertLead(input: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        name: input.name,
        source: input.source,
        business_type: input.businessType,
        area: input.area,
        requirement: input.requirement,
        contact: input.contact,
        contact_method: input.contactMethod || null,
        phone: input.phone || null,
        client_type: input.clientType || null,
        status: input.status,
        is_warm: input.isWarm,
        object_id: input.objectId || null,
        last_contacted_at: input.lastContactedAt || null,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as LeadRow);
  });
}

export function updateLead(id: string, input: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('leads')
      .update({
        name: input.name,
        source: input.source,
        business_type: input.businessType,
        area: input.area,
        requirement: input.requirement,
        contact: input.contact,
        contact_method: input.contactMethod || null,
        phone: input.phone || null,
        client_type: input.clientType || null,
        status: input.status,
        is_warm: input.isWarm,
        object_id: input.objectId || null,
        last_contacted_at: input.lastContactedAt || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as LeadRow);
  });
}

export function deleteLead(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
  });
}
