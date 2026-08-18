import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Estimate, EstimateQuestion, EstimateRow, EstimateSection } from '../data/estimates';

function fromRow(row: EstimateRow): Estimate {
  return {
    id: row.id,
    objectId: row.object_id,
    sections: row.sections ?? [],
    questions: row.questions ?? [],
    createdAt: row.created_at,
  };
}

export function fetchEstimates(): Promise<Estimate[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('estimates').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as EstimateRow[]).map(fromRow);
  });
}

export function fetchEstimate(id: string): Promise<Estimate> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('estimates').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data as EstimateRow);
  });
}

export function insertEstimate(input: { objectId: string; sections: EstimateSection[]; questions: EstimateQuestion[] }): Promise<Estimate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('estimates')
      .insert({ object_id: input.objectId, sections: input.sections, questions: input.questions })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as EstimateRow);
  });
}

export function updateEstimate(id: string, input: { sections: EstimateSection[]; questions: EstimateQuestion[] }): Promise<Estimate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('estimates')
      .update({ sections: input.sections, questions: input.questions })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as EstimateRow);
  });
}

export function deleteEstimate(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('estimates').delete().eq('id', id);
    if (error) throw error;
  });
}
