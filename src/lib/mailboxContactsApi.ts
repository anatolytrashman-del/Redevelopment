import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { MailboxContact, MailboxContactRow } from '../data/mailbox';

function fromRow(row: MailboxContactRow): MailboxContact {
  return {
    id: row.id,
    title: row.title ?? '',
    category: row.category ?? '',
    personName: row.person_name ?? '',
    email: row.email ?? '',
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

function toRow(input: Omit<MailboxContact, 'id' | 'createdAt'>) {
  return {
    title: input.title,
    category: input.category,
    person_name: input.personName,
    email: input.email,
    note: input.note,
  };
}

export function fetchMailboxContacts(): Promise<MailboxContact[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('mailbox_contacts')
      .select('*')
      .order('title', { ascending: true });
    if (error) throw error;
    return (data as MailboxContactRow[]).map(fromRow);
  });
}

export function insertMailboxContact(input: Omit<MailboxContact, 'id' | 'createdAt'>): Promise<MailboxContact> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('mailbox_contacts').insert(toRow(input)).select().single();
    if (error) throw error;
    return fromRow(data as MailboxContactRow);
  });
}

export function updateMailboxContact(
  id: string,
  input: Omit<MailboxContact, 'id' | 'createdAt'>,
): Promise<MailboxContact> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('mailbox_contacts').update(toRow(input)).eq('id', id).select().single();
    if (error) throw error;
    return fromRow(data as MailboxContactRow);
  });
}

export function deleteMailboxContact(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('mailbox_contacts').delete().eq('id', id);
    if (error) throw error;
  });
}
