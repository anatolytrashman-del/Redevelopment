import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { EmailTemplate, EmailTemplateRow } from '../data/emailTemplates';

function fromRow(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject ?? '',
    body: row.body ?? '',
    requestId: row.request_id,
    kind: row.kind === 'reminder_1' || row.kind === 'reminder_2' ? row.kind : null,
    createdAt: row.created_at,
  };
}

export function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('email_templates').select('*').order('name', { ascending: true });
    if (error) throw error;
    return (data as EmailTemplateRow[]).map(fromRow);
  });
}

export function insertEmailTemplate(input: Omit<EmailTemplate, 'id' | 'createdAt'>): Promise<EmailTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_templates')
      .insert({ name: input.name, subject: input.subject, body: input.body, request_id: input.requestId, kind: input.kind })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as EmailTemplateRow);
  });
}

export function updateEmailTemplate(id: string, input: Omit<EmailTemplate, 'id' | 'createdAt'>): Promise<EmailTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_templates')
      .update({ name: input.name, subject: input.subject, body: input.body, request_id: input.requestId, kind: input.kind })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as EmailTemplateRow);
  });
}

export function deleteEmailTemplate(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) throw error;
  });
}
