// Комментарии к строке "Транзакции" (см. Transactions.tsx) — тот же принцип,
// что и у LeadNote (data/leadNotes.ts): дата + текст, несколько записей на
// одну транзакцию, без удаления самой транзакции. Нужны, когда сумму/статус
// уже нечем объяснить в самих полях формы — например, почему компенсация
// решена именно так, или на что распалась общая сумма.
export interface TransactionComment {
  id: string;
  transactionId: string;
  body: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/transactionCommentsApi.ts
export interface TransactionCommentRow {
  id: string;
  transaction_id: string;
  body: string;
  created_at: string;
}
