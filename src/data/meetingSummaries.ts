// Саммери встреч — расшифровки/конспекты переговоров (с юристами,
// консультантами, контрагентами и т.п.), которые не хочется держать в
// файлах на компьютере. Публикуется по share_token на /summary/:token —
// без пароля админки, чтобы второй стороне разговора можно было просто
// скинуть ссылку почитать (тот же приём, что у Brief на /tz/:token).
export interface MeetingSummary {
  id: string;
  title: string;
  // Markdown — рендерится и в форме редактирования (превью), и на
  // публичной странице (см. lib/markdown.ts).
  content: string;
  shareToken: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/meetingSummariesApi.ts
export interface MeetingSummaryRow {
  id: string;
  title: string;
  content: string;
  share_token: string;
  created_at: string;
}
