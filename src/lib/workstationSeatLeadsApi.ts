import { supabase } from './supabase';
import { withRetry } from './withRetry';

// Один купленный/забронированный юнит внутри зоны с фиксированными рабочими
// местами (BuildingPlanZone.workstationCount) — в отличие от обычного
// кабинета, где один лид занимает всю зону (zone.leadId), тут одна зона
// может иметь до workstationCount разных лидов, каждый со своей строкой.
export interface WorkstationSeatLead {
  id: string;
  zoneId: string;
  leadId: string;
  createdAt: string;
}

interface WorkstationSeatLeadRow {
  id: string;
  zone_id: string;
  lead_id: string;
  created_at: string;
}

function fromRow(row: WorkstationSeatLeadRow): WorkstationSeatLead {
  return { id: row.id, zoneId: row.zone_id, leadId: row.lead_id, createdAt: row.created_at };
}

export function fetchWorkstationSeatLeads(): Promise<WorkstationSeatLead[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('workstation_seat_leads').select('*');
    if (error) throw error;
    return (data as WorkstationSeatLeadRow[]).map(fromRow);
  });
}

export function insertWorkstationSeatLead(input: { zoneId: string; leadId: string }): Promise<WorkstationSeatLead> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('workstation_seat_leads')
      .insert({ zone_id: input.zoneId, lead_id: input.leadId })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as WorkstationSeatLeadRow);
  });
}

export function deleteWorkstationSeatLead(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('workstation_seat_leads').delete().eq('id', id);
    if (error) throw error;
  });
}
