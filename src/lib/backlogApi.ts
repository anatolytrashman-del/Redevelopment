import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { BacklogIdea, BacklogIdeaRow } from '../data/backlog';

function fromRow(row: BacklogIdeaRow): BacklogIdea {
  return {
    id: row.id,
    idea: row.idea,
    benefit: row.benefit,
    createdAt: row.created_at,
  };
}

export function fetchBacklogIdeas(): Promise<BacklogIdea[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('backlog_ideas').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as BacklogIdeaRow[]).map(fromRow);
  });
}

export function insertBacklogIdea(input: { idea: string; benefit: string }): Promise<BacklogIdea> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('backlog_ideas')
      .insert({ idea: input.idea, benefit: input.benefit })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as BacklogIdeaRow);
  });
}

export function fetchBacklogUnreadCount(sinceIso: string): Promise<number> {
  return withRetry(async () => {
    const { count, error } = await supabase
      .from('backlog_ideas')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', sinceIso);
    if (error) throw error;
    return count ?? 0;
  });
}
