import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { TransactionComment, TransactionCommentRow } from '../data/transactionComments';

function fromRow(row: TransactionCommentRow): TransactionComment {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

// Все комментарии сразу, не по одной транзакции за раз — таблица небольшая
// (комментируют не каждую строку), а сама страница "Транзакции" и так
// целиком грузит все транзакции разом (см. fetchTransactions), без пагинации.
// Сортировка по возрастанию — компонент сам переворачивает при отображении,
// где нужно (новые сверху), группировка по transactionId — на клиенте.
export function fetchTransactionComments(): Promise<TransactionComment[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('transaction_comments').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as TransactionCommentRow[]).map(fromRow);
  });
}

export function insertTransactionComment(transactionId: string, body: string): Promise<TransactionComment> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('transaction_comments')
      .insert({ transaction_id: transactionId, body })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as TransactionCommentRow);
  });
}

export function deleteTransactionComment(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('transaction_comments').delete().eq('id', id);
    if (error) throw error;
  });
}
