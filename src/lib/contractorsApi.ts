import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Contractor, ContractorRow } from '../data/contractors';

function fromRow(row: ContractorRow): Contractor {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    contact: row.contact,
    contactMethod: row.contact_method ?? '',
    notes: row.notes ?? '',
    isCoreTeam: row.is_core_team,
    createdAt: row.created_at,
  };
}

export function fetchContractors(): Promise<Contractor[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('contractors').select('*').order('name', { ascending: true });
    if (error) throw error;
    return (data as ContractorRow[]).map(fromRow);
  });
}

export function insertContractor(input: Omit<Contractor, 'id' | 'createdAt'>): Promise<Contractor> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contractors')
      .insert({
        name: input.name,
        specialty: input.specialty,
        contact: input.contact,
        contact_method: input.contactMethod || null,
        notes: input.notes || null,
        is_core_team: input.isCoreTeam,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as ContractorRow);
  });
}

export function updateContractor(id: string, input: Omit<Contractor, 'id' | 'createdAt'>): Promise<Contractor> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contractors')
      .update({
        name: input.name,
        specialty: input.specialty,
        contact: input.contact,
        contact_method: input.contactMethod || null,
        notes: input.notes || null,
        is_core_team: input.isCoreTeam,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as ContractorRow);
  });
}

export function deleteContractor(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('contractors').delete().eq('id', id);
    if (error) throw error;
  });
}
