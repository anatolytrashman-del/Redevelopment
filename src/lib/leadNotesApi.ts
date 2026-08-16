import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { todayIsoDate } from './todayIsoDate';
import type { LeadNote, LeadNoteRow } from '../data/leadNotes';

function fromRow(row: LeadNoteRow): LeadNote {
  return {
    id: row.id,
    leadId: row.lead_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function fetchLeadNotes(leadId: string): Promise<LeadNote[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('lead_notes')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as LeadNoteRow[]).map(fromRow);
  });
}

// Кроме самой заметки двигает у лида дату последнего контакта на сегодня:
// менеджер и так фиксирует разговор текстом, заставлять его отдельно править
// ещё и дату — лишний шаг, который будут забывать. Возвращаем новую дату,
// чтобы страница обновила лид в своём стейте без перезагрузки списка.
//
// Если заметка записалась, а дата не обновилась — это не повод показывать
// ошибку: заметка (главное) уже сохранена, дата подтянется при следующей.
export function insertLeadNote(leadId: string, body: string): Promise<{ note: LeadNote; lastContactedAt: string }> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('lead_notes')
      .insert({ lead_id: leadId, body })
      .select()
      .single();
    if (error) throw error;

    const lastContactedAt = todayIsoDate();
    await supabase.from('leads').update({ last_contacted_at: lastContactedAt }).eq('id', leadId);

    return { note: fromRow(data as LeadNoteRow), lastContactedAt };
  });
}

export function deleteLeadNote(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('lead_notes').delete().eq('id', id);
    if (error) throw error;
  });
}
