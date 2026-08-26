import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { DistrictQuarterFlag, DistrictQuarterFlagRow } from '../data/districtQuarterFlags';

function fromRow(row: DistrictQuarterFlagRow): DistrictQuarterFlag {
  return { quarterId: row.quarter_id, createdAt: row.created_at };
}

export function fetchDistrictQuarterFlags(): Promise<DistrictQuarterFlag[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('district_quarter_flags').select('*');
    if (error) throw error;
    return (data as DistrictQuarterFlagRow[]).map(fromRow);
  });
}

export function insertDistrictQuarterFlag(quarterId: string): Promise<DistrictQuarterFlag> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('district_quarter_flags')
      .insert({ quarter_id: quarterId })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as DistrictQuarterFlagRow);
  });
}

export function deleteDistrictQuarterFlag(quarterId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('district_quarter_flags').delete().eq('quarter_id', quarterId);
    if (error) throw error;
  });
}
