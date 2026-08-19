import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Estimate, EstimateQuestion, EstimateRow, EstimateSection } from '../data/estimates';

function fromRow(row: EstimateRow): Estimate {
  return {
    id: row.id,
    objectId: row.object_id,
    // positions/manufacturer/model/price добавили позже body — у строк,
    // сохранённых до этого, их нет в JSONB вообще, а не пустое значение.
    // price (единое поле "Цена, $") — более старая форма, чем priceByn/
    // priceRub/priceUsd: то, что в ней успели сохранить, переносим в USD.
    sections: (row.sections ?? []).map((s) => ({
      ...s,
      positions: (s.positions ?? []).map((p) => ({
        ...p,
        colors: p.colors ?? [],
        dimensions: p.dimensions ?? [],
        products: p.products.map((prod) => {
          const legacyPrice = (prod as unknown as { price?: number | null }).price;
          return {
            ...prod,
            manufacturer: prod.manufacturer ?? '',
            model: prod.model ?? '',
            priceByn: prod.priceByn ?? null,
            priceRub: prod.priceRub ?? null,
            priceUsd: prod.priceUsd ?? legacyPrice ?? null,
          };
        }),
      })),
    })),
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
