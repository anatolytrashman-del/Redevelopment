// Список статусов открытый (растущий), как requirement/clientType у лидов —
// стартовый набор ниже, пользователь может добавить свой прямо из формы
// (AddableSelect в Financing.tsx).
export const financingStatuses = [
  'Не связывался',
  'Направил общее письмо',
  'Общаюсь с личным менеджером',
  'Жду КП',
  'Получены условия',
] as const;
export type FinancingStatus = string;

export interface FinancingOffer {
  id: string;
  logoUrl: string;
  bankName: string;
  website: string;
  generalEmail: string;
  managerName: string;
  managerContact: string;
  rateOffer: string;
  maxTerm: string;
  status: FinancingStatus;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/financingApi.ts
export interface FinancingOfferRow {
  id: string;
  logo_url: string;
  bank_name: string;
  website: string;
  general_email: string;
  manager_name: string;
  manager_contact: string;
  rate_offer: string;
  max_term: string;
  status: string;
  created_at: string;
}
