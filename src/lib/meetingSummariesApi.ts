import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { MeetingSummary, MeetingSummaryRow } from '../data/meetingSummaries';

function fromRow(row: MeetingSummaryRow): MeetingSummary {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    shareToken: row.share_token,
    createdAt: row.created_at,
  };
}

// Короткий токен для публичной ссылки — генерируется на клиенте (не через
// DB default), как и у part объектов/техзаданий с ручными слагами: просто
// уникальная строка, не обязана быть криптостойкой (не секрет, а ссылка
// "на почитать").
function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export function fetchMeetingSummaries(): Promise<MeetingSummary[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('meeting_summaries').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as MeetingSummaryRow[]).map(fromRow);
  });
}

export function fetchMeetingSummary(id: string): Promise<MeetingSummary> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('meeting_summaries').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data as MeetingSummaryRow);
  });
}

// Публичная страница /summary/:token — по share_token, не по внутреннему id
// (тот же паттерн, что и fetchBriefByToken в briefsApi.ts).
export function fetchMeetingSummaryByToken(token: string): Promise<MeetingSummary> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('meeting_summaries').select('*').eq('share_token', token).single();
    if (error) throw error;
    return fromRow(data as MeetingSummaryRow);
  });
}

export function insertMeetingSummary(input: { title: string; content: string }): Promise<MeetingSummary> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('meeting_summaries')
      .insert({ title: input.title, content: input.content, share_token: generateShareToken() })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as MeetingSummaryRow);
  });
}

export function updateMeetingSummary(id: string, input: { title: string; content: string }): Promise<MeetingSummary> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('meeting_summaries')
      .update({ title: input.title, content: input.content })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as MeetingSummaryRow);
  });
}

export function deleteMeetingSummary(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('meeting_summaries').delete().eq('id', id);
    if (error) throw error;
  });
}
