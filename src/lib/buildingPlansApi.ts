import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  BuildingPlan,
  BuildingPlanRow,
  BuildingPlanZone,
  BuildingPlanZoneRow,
  ZoneStatus,
  ZoneType,
} from '../data/buildingPlans';

function planFromRow(row: BuildingPlanRow): BuildingPlan {
  return { id: row.id, name: row.name, imageUrl: row.image_url };
}

function zoneFromRow(row: BuildingPlanZoneRow): BuildingPlanZone {
  return {
    id: row.id,
    buildingPlanId: row.building_plan_id,
    zoneType: row.zone_type as ZoneType,
    label: row.label,
    area: row.area,
    status: (row.status as ZoneStatus | null) ?? 'Свободно',
    leadId: row.lead_id ?? '',
    features: row.features ?? [],
    points: row.points,
  };
}

export function fetchBuildingPlans(): Promise<BuildingPlan[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('building_plans').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as BuildingPlanRow[]).map(planFromRow);
  });
}

export function insertBuildingPlan(input: { name: string; imageUrl: string }): Promise<BuildingPlan> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('building_plans')
      .insert({ name: input.name, image_url: input.imageUrl })
      .select()
      .single();
    if (error) throw error;
    return planFromRow(data as BuildingPlanRow);
  });
}

export function updateBuildingPlan(id: string, patch: { name?: string; imageUrl?: string }): Promise<BuildingPlan> {
  return withRetry(async () => {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.imageUrl !== undefined) payload.image_url = patch.imageUrl;

    const { data, error } = await supabase.from('building_plans').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return planFromRow(data as BuildingPlanRow);
  });
}

export function uploadBuildingPlanImage(file: File): Promise<string> {
  return withRetry(async () => {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('building-plans').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('building-plans').getPublicUrl(path);
    return data.publicUrl;
  });
}

export function fetchZonesForPlan(buildingPlanId: string): Promise<BuildingPlanZone[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('building_plan_zones')
      .select('*')
      .eq('building_plan_id', buildingPlanId);
    if (error) throw error;
    return (data as BuildingPlanZoneRow[]).map(zoneFromRow);
  });
}

// Зоны, у которых есть привязанный клиент и статус отличается от "Свободно" —
// то есть кабинет либо забронирован, либо продан конкретному лиду.
// Используется на странице "Лиды", чтобы показывать брони отдельным блоком.
export function fetchBookedZones(): Promise<BuildingPlanZone[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('building_plan_zones')
      .select('*')
      .neq('status', 'Свободно')
      .not('lead_id', 'is', null);
    if (error) throw error;
    return (data as BuildingPlanZoneRow[]).map(zoneFromRow);
  });
}

export function insertZone(input: Omit<BuildingPlanZone, 'id'>): Promise<BuildingPlanZone> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('building_plan_zones')
      .insert({
        building_plan_id: input.buildingPlanId,
        zone_type: input.zoneType,
        label: input.label,
        area: input.area,
        status: input.status,
        lead_id: input.leadId || null,
        features: input.features,
        points: input.points,
      })
      .select()
      .single();
    if (error) throw error;
    return zoneFromRow(data as BuildingPlanZoneRow);
  });
}

export function updateZone(
  id: string,
  patch: Partial<Pick<BuildingPlanZone, 'label' | 'area' | 'status' | 'leadId' | 'features' | 'points'>>,
): Promise<BuildingPlanZone> {
  return withRetry(async () => {
    const payload: Record<string, unknown> = {};
    if (patch.label !== undefined) payload.label = patch.label;
    if (patch.area !== undefined) payload.area = patch.area;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.leadId !== undefined) payload.lead_id = patch.leadId || null;
    if (patch.features !== undefined) payload.features = patch.features;
    if (patch.points !== undefined) payload.points = patch.points;

    const { data, error } = await supabase.from('building_plan_zones').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return zoneFromRow(data as BuildingPlanZoneRow);
  });
}

export function deleteZone(id: string): Promise<void> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('building_plan_zones').delete().eq('id', id).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Зона не удалена: не хватает прав доступа (RLS) или запись уже удалена');
    }
  });
}
