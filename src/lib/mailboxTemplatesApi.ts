import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { MailboxTemplate, MailboxTemplateRow } from '../data/mailboxTemplates';

function fromRow(row: MailboxTemplateRow): MailboxTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject ?? '',
    body: row.body ?? '',
    createdAt: row.created_at,
  };
}

function toRow(input: Omit<MailboxTemplate, 'id' | 'createdAt'>) {
  return { name: input.name, subject: input.subject, body: input.body };
}

export function fetchMailboxTemplates(): Promise<MailboxTemplate[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('mailbox_email_templates')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data as MailboxTemplateRow[]).map(fromRow);
  });
}

export function insertMailboxTemplate(input: Omit<MailboxTemplate, 'id' | 'createdAt'>): Promise<MailboxTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('mailbox_email_templates').insert(toRow(input)).select().single();
    if (error) throw error;
    return fromRow(data as MailboxTemplateRow);
  });
}

export function updateMailboxTemplate(
  id: string,
  input: Omit<MailboxTemplate, 'id' | 'createdAt'>,
): Promise<MailboxTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('mailbox_email_templates')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as MailboxTemplateRow);
  });
}

export function deleteMailboxTemplate(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('mailbox_email_templates').delete().eq('id', id);
    if (error) throw error;
  });
}
