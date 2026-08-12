import { supabase } from './supabase';
import type { Transaction, TransactionRow } from '../data/transactions';

function fromRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    currency: row.currency,
    purpose: row.purpose,
    category: row.category as Transaction['category'],
    paidBy: row.paid_by,
    paidFrom: row.paid_from,
    compensated: row.compensated,
  };
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as TransactionRow[]).map(fromRow);
}

export async function insertTransaction(input: Omit<Transaction, 'id'>): Promise<Transaction> {
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
}
