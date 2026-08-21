import { supabase } from './supabase';
import { withRetry } from './withRetry';
import {
  defaultFinAmortization,
  defaultFinCapexReserve,
  defaultFinCategories,
  defaultFinLeasing,
  defaultFinParams,
  defaultFinRent,
  defaultFinSales,
  type FinAmortization,
  type FinCapexReserve,
  type FinCategory,
  type FinLeasing,
  type FinModel,
  type FinModelRow,
  type FinParams,
  type FinRent,
  type FinSale,
} from '../data/finModels';

// Дефолты подставляются и при чтении — на случай строк, сохранённых до
// добавления новых полей в params/leasing/rent/amortization/sales/capex
// (тот же приём, что fromRow в estimatesApi.ts).
function fromRow(row: FinModelRow): FinModel {
  // До разделения "срока амортизации" и "срока договора" termMonths был
  // и тем, и другим сразу — у старых сохранённых моделей переносим его
  // значение в amortizationMonths, а termMonths (баллон) оставляем пустым,
  // чтобы поведение расчёта не изменилось молча.
  const rawLeasing: Partial<FinLeasing> & { annualRatePct?: number | null } = row.leasing ?? {};
  const leasing = { ...defaultFinLeasing(), ...rawLeasing };
  if (rawLeasing.amortizationMonths == null && rawLeasing.termMonths != null) {
    leasing.amortizationMonths = rawLeasing.termMonths;
    leasing.termMonths = null;
  }
  // До комбинированной ставки по годам была одна annualRatePct на весь
  // срок — у старых сохранённых моделей переносим её в ratePctYear1 (ярусы
  // 2/3 не заполнены — rateForLoanMonth в finModelCalc.ts сам продолжит
  // тем же значением, поведение расчёта не меняется молча).
  if (rawLeasing.ratePctYear1 == null && rawLeasing.annualRatePct != null) {
    leasing.ratePctYear1 = rawLeasing.annualRatePct;
  }

  return {
    id: row.id,
    objectId: row.object_id,
    name: row.name,
    params: { ...defaultFinParams(), ...(row.params ?? {}) },
    leasing,
    rent: { ...defaultFinRent(), ...(row.rent ?? {}) },
    amortization: { ...defaultFinAmortization(), ...(row.amortization ?? {}) },
    capexReserve: { ...defaultFinCapexReserve(), ...(row.capex_reserve ?? {}) },
    sales: (row.sales ?? defaultFinSales()).map((s) => ({
      id: s.id,
      label: s.label,
      saleDate: s.saleDate ?? '',
      areaMeters: s.areaMeters ?? null,
      pricePerMeterUsd: s.pricePerMeterUsd ?? null,
      exchangeRate: s.exchangeRate ?? null,
      applyToLeasing: s.applyToLeasing ?? false,
      transactionCost: s.transactionCost ?? null,
    })),
    // reimbursable/vatIncluded/vatPct добавлены позже — на статьях,
    // сохранённых до этого, их нет в JSONB, без ?? чекбоксы ушли бы в React
    // undefined→controlled.
    categories: (row.categories ?? []).map((c) => ({
      ...c,
      entries: c.entries.map((e) => ({
        ...e,
        reimbursable: e.reimbursable ?? false,
        vatIncluded: e.vatIncluded ?? false,
        vatPct: e.vatPct ?? null,
      })),
    })),
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
  rent?: FinRent;
  amortization?: FinAmortization;
  capexReserve?: FinCapexReserve;
  sales?: FinSale[];
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
        rent: input.rent ?? defaultFinRent(),
        amortization: input.amortization ?? defaultFinAmortization(),
        capex_reserve: input.capexReserve ?? defaultFinCapexReserve(),
        sales: input.sales ?? defaultFinSales(),
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
  input: {
    name: string;
    params: FinParams;
    leasing: FinLeasing;
    rent: FinRent;
    amortization: FinAmortization;
    capexReserve: FinCapexReserve;
    sales: FinSale[];
    categories: FinCategory[];
  },
): Promise<FinModel> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('fin_models')
      .update({
        name: input.name,
        params: input.params,
        leasing: input.leasing,
        rent: input.rent,
        amortization: input.amortization,
        capex_reserve: input.capexReserve,
        sales: input.sales,
        categories: input.categories,
      })
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
  const sales = source.sales.map((s) => ({ ...s, id: crypto.randomUUID() }));
  return insertFinModel({
    objectId: source.objectId,
    name: `${source.name} (копия)`,
    params: { ...source.params },
    leasing: { ...source.leasing },
    rent: { ...source.rent },
    amortization: { ...source.amortization },
    capexReserve: { ...source.capexReserve },
    sales,
    categories,
  });
}
