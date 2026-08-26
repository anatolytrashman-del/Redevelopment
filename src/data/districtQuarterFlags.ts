// Отметка "квартал верифицирован" — владелец методично сверяет список
// домов каждого квартала вживую (пример — полная пересверка "Западная
// Европа"/"Эмиратс", 2026-08-26), эта отметка просто фиксирует, какие
// кварталы уже прошли такую сверку, чтобы не забыть, что уже проверено,
// а что ещё нет. Наличие строки в таблице = квартал отмечен верифицированным
// (тот же минималистичный паттерн, что и у DistrictHouseFlag).
export interface DistrictQuarterFlag {
  quarterId: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/districtQuarterFlagsApi.ts
export interface DistrictQuarterFlagRow {
  quarter_id: string;
  created_at: string;
}
