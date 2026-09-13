import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Collaboration, CollaborationRow } from '../data/collaborations';

function fromRow(row: CollaborationRow): Collaboration {
  return {
    id: row.id,
    partner: row.partner,
    contactMethod: row.contact_method ?? '',
    contact: row.contact ?? '',
    link: row.link ?? '',
    agreement: row.agreement ?? '',
    status: row.status,
    createdAt: row.created_at,
  };
}

export function fetchCollaborations(): Promise<Collaboration[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('collaborations').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as CollaborationRow[]).map(fromRow);
  });
}

export function insertCollaboration(input: Omit<Collaboration, 'id' | 'createdAt'>): Promise<Collaboration> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('collaborations')
      .insert({
        partner: input.partner,
        contact_method: input.contactMethod || null,
        contact: input.contact || null,
        link: input.link || null,
        agreement: input.agreement || null,
        status: input.status,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as CollaborationRow);
  });
}

export function updateCollaboration(id: string, input: Omit<Collaboration, 'id' | 'createdAt'>): Promise<Collaboration> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('collaborations')
      .update({
        partner: input.partner,
        contact_method: input.contactMethod || null,
        contact: input.contact || null,
        link: input.link || null,
        agreement: input.agreement || null,
        status: input.status,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as CollaborationRow);
  });
}

export function deleteCollaboration(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('collaborations').delete().eq('id', id);
    if (error) throw error;
  });
}
