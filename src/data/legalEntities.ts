// Юрлица владельца (ЧУП/ООО и т.п.) — раздел "Документы" → вкладка "Юрлица"
// (см. Documents.tsx). Каждое юрлицо — отдельная страница
// (LegalEntityDetail.tsx) с несколькими группами документов внутри (первая
// такая группа — налоговые декларации, см. data/taxDeclarations.ts).

export interface LegalEntity {
  id: string;
  name: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/legalEntitiesApi.ts
export interface LegalEntityRow {
  id: string;
  name: string;
  created_at: string;
}
