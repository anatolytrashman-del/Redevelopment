import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { DistrictHouseFlag, DistrictHouseFlagRow, DistrictHouseFlagStatus } from '../data/districtHouseFlags';

function fromRow(row: DistrictHouseFlagRow): DistrictHouseFlag {
  return {
    id: row.id,
    street: row.street,
    house: row.house,
    quarterId: row.quarter_id,
    status: (row.status as DistrictHouseFlagStatus) || 'not_commissioned',
    createdAt: row.created_at,
  };
}

export function fetchDistrictHouseFlags(): Promise<DistrictHouseFlag[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('district_house_flags').select('*');
    if (error) throw error;
    return (data as DistrictHouseFlagRow[]).map(fromRow);
  });
}

export function insertDistrictHouseFlag(input: {
  street: string;
  house: string;
  quarterId: string;
  status: DistrictHouseFlagStatus;
}): Promise<DistrictHouseFlag> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('district_house_flags')
      .insert({ street: input.street, house: input.house, quarter_id: input.quarterId, status: input.status })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as DistrictHouseFlagRow);
  });
}

export function deleteDistrictHouseFlag(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('district_house_flags').delete().eq('id', id);
    if (error) throw error;
  });
}
