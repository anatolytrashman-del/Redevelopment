export const leadSources = ['Kufar', 'Realt'] as const;
export type LeadSource = (typeof leadSources)[number];

// Список требований открытый — новые значения можно добавлять прямо
// из формы лида, как и категории транзакций.
export const leadRequirements = ['Мокрая точка'] as const;

export interface Lead {
  id: string;
  name: string;
  source: LeadSource;
  businessType: string;
  area: string;
  requirement: string;
  contact: string;
  status: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/leadsApi.ts
export interface LeadRow {
  id: string;
  name: string;
  source: string;
  business_type: string;
  area: string;
  requirement: string;
  contact: string;
  status: string;
}
