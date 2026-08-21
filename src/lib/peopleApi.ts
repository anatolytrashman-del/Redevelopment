import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Person, PersonRow } from '../data/people';

function fromRow(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    isTaskAssignee: row.is_task_assignee,
    isSplitPayer: row.is_split_payer,
    isSoloPayer: row.is_solo_payer,
    isIncomePayer: row.is_income_payer,
  };
}

export function fetchPeople(): Promise<Person[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('people').select('*').order('name', { ascending: true });
    if (error) throw error;
    return (data as PersonRow[]).map(fromRow);
  });
}
