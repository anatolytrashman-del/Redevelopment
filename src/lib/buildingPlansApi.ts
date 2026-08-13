import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { BuildingPlan, BuildingPlanRow, BuildingPlanZone, BuildingPlanZoneRow, ZoneType } from '../data/buildingPlans';

function planFromRow(row: BuildingPlanRow): BuildingPlan {
  return { id: row.id, name: row.name, imageUrl: row.image_url };
}

function zoneFromRow(row: BuildingPlanZoneRow): BuildingPlanZone {
  return {
    id: row.id,
    buildingPlanId: row.building_plan_id,
    zoneType: row.zone_type as ZoneType,
    label: row.label,
    objectId: row.object_id ?? '',
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

export function insertZone(input: Omit<BuildingPlanZone, 'id'>): Promise<BuildingPlanZone> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('building_plan_zones')
      .insert({
        building_plan_id: input.buildingPlanId,
        zone_type: input.zoneType,
        label: input.label,
        object_id: input.objectId || null,
        points: input.points,
      })
      .select()
      .single();
    if (error) throw error;
    return zoneFromRow(data as BuildingPlanZoneRow);
  });
}

export function deleteZone(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('building_plan_zones').delete().eq('id', id);
    if (error) throw error;
  });
}
