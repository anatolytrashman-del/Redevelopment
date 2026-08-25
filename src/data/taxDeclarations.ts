import type { DocumentFile } from './contractorDocuments';

// Налоговые декларации юрлица — первая группа документов внутри страницы
// юрлица (см. LegalEntityDetail.tsx). Квартал+год задаются отдельными
// полями (не свободным текстом), заголовок карточки собирается из них
// автоматически — см. taxDeclarationTitle ниже.
export const QUARTERS = [1, 2, 3, 4] as const;
export type Quarter = (typeof QUARTERS)[number];

// Один и тот же файл может быть пакетом из нескольких страниц/приложений —
// тот же паттерн files: DocumentFile[], что и у ContractorDocument/LegalDocument.
export interface TaxDeclaration {
  id: string;
  legalEntityId: string;
  quarter: Quarter;
  year: number;
  files: DocumentFile[];
  uploadedAt: string;
}

export interface TaxDeclarationRow {
  id: string;
  legal_entity_id: string;
  quarter: number;
  year: number;
  files: DocumentFile[];
  uploaded_at: string;
}

export function taxDeclarationTitle(d: Pick<TaxDeclaration, 'quarter' | 'year'>): string {
  return `Налоговая декларация за ${d.quarter} квартал ${d.year}`;
}
