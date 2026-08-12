import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Transaction, TransactionRow } from '../data/transactions';

function fromRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    currency: row.currency,
    purpose: row.purpose,
    category: row.category as Transaction['category'],
    paidBy: row.paid_by as Transaction['paidBy'],
    paidFrom: row.paid_from,
    compensated: row.compensated,
  };
}

export function fetchTransactions(): Promise<Transaction[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as TransactionRow[]).map(fromRow);
  });
}

export function insertTransaction(input: Omit<Transaction, 'id'>): Promise<Transaction> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        date: input.date,
        amount: input.amount,
        currency: input.currency,
        purpose: input.purpose,
        category: input.category,
        paid_by: input.paidBy,
        paid_from: input.paidFrom,
        compensated: input.compensated,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as TransactionRow);
  });
}

export function updateTransaction(id: string, input: Omit<Transaction, 'id'>): Promise<Transaction> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        date: input.date,
        amount: input.amount,
        currency: input.currency,
        purpose: input.purpose,
        category: input.category,
        paid_by: input.paidBy,
        paid_from: input.paidFrom,
        compensated: input.compensated,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as TransactionRow);
  });
}
