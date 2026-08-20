import { supabase } from './supabase';
import { withRetry } from './withRetry';
import {
  defaultFinCategories,
  defaultFinLeasing,
  defaultFinParams,
  type FinCategory,
  type FinLeasing,
  type FinModel,
  type FinModelRow,
  type FinParams,
} from '../data/finModels';

// Дефолты подставляются и при чтении — на случай строк, сохранённых до
// добавления новых полей в params/leasing (тот же приём, что fromRow в
// estimatesApi.ts).
function fromRow(row: FinModelRow): FinModel {
  return {
    id: row.id,
    objectId: row.object_id,
    name: row.name,
    params: { ...defaultFinParams(), ...(row.params ?? {}) },
    leasing: { ...defaultFinLeasing(), ...(row.leasing ?? {}) },
    categories: row.categories ?? [],
    createdAt: row.created_at,
  };
}

export function fetchFinModels(): Promise<FinModel[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('fin_models').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as FinModelRow[]).map(fromRow);
  });
}

export function fetchFinModel(id: string): Promise<FinModel> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('fin_models').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data as FinModelRow);
  });
}

export function insertFinModel(input: {
  objectId: string;
  name: string;
  params?: FinParams;
  leasing?: FinLeasing;
  categories?: FinCategory[];
}): Promise<FinModel> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('fin_models')
      .insert({
        object_id: input.objectId,
        name: input.name,
        params: input.params ?? defaultFinParams(),
        leasing: input.leasing ?? defaultFinLeasing(),
        categories: input.categories ?? defaultFinCategories(),
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as FinModelRow);
  });
}

export function updateFinModel(
  id: string,
  input: { name: string; params: FinParams; leasing: FinLeasing; categories: FinCategory[] },
): Promise<FinModel> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('fin_models')
      .update({ name: input.name, params: input.params, leasing: input.leasing, categories: input.categories })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as FinModelRow);
  });
}

export function deleteFinModel(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('fin_models').delete().eq('id', id);
    if (error) throw error;
  });
}

// Дубликат под сценарии ("оптимистичный"/"пессимистичный") — копия всех
// данных с новыми id у категорий/статей, чтобы правки копии не путались с
// оригиналом даже при ручном сравнении JSONB в базе.
export function duplicateFinModel(source: FinModel): Promise<FinModel> {
  const categories = source.categories.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
    entries: c.entries.map((e) => ({ ...e, id: crypto.randomUUID() })),
  }));
  return insertFinModel({
    objectId: source.objectId,
    name: `${source.name} (копия)`,
    params: { ...source.params },
    leasing: { ...source.leasing },
    categories,
  });
}
