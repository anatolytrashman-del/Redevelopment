// Объекты недвижимости в залоге — отдельная лёгкая сущность на странице
// Объекты, а не полноценная страница по образцу RealtyObject (у объекта
// в проработке есть отдельный маршрут /admin/objects/:id с планировками,
// техпаспортом и т.п. — залогу это не нужно, только карточка+модалка,
// тот же паттерн, что у Lead).
export interface Pledge {
  id: string;
  address: string;
  area: number;
  marketValue: number;
  pledgeValue: number;
  rentalIncome: number;
  // Пути файлов в приватном бакете pledge-photos, не готовые URL — тот же
  // паттерн, что и у Lead.photoPath/Contractor.photoPath (см.
  // lib/pledgesApi.ts), но массив: у объекта в залоге фотографий несколько.
  photoPaths: string[];
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/pledgesApi.ts
export interface PledgeRow {
  id: string;
  address: string;
  area: number;
  market_value: number;
  pledge_value: number;
  rental_income: number;
  photo_paths: string[] | null;
  created_at: string;
}
