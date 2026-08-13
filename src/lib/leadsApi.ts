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
    status: row.status,
    isWarm: row.is_warm,
    objectId: row.object_id ?? '',
  };
}

export function fetchLeads(): Promise<Lead[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as LeadRow[]).map(fromRow);
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

export function insertLead(input: Omit<Lead, 'id'>): Promise<Lead> {
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
        status: input.status,
        is_warm: input.isWarm,
        object_id: input.objectId || null,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as LeadRow);
  });
}

export function updateLead(id: string, input: Omit<Lead, 'id'>): Promise<Lead> {
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
        status: input.status,
        is_warm: input.isWarm,
        object_id: input.objectId || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as LeadRow);
  });
}
