import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Currency } from '../data/transactions';
import type { TransactionBalanceAdjustment, TransactionBalanceAdjustmentRow } from '../data/transactionBalanceAdjustments';

function fromRow(row: TransactionBalanceAdjustmentRow): TransactionBalanceAdjustment {
  return {
    id: row.id,
    payer: row.payer,
    currency: row.currency as Currency,
    amount: row.amount,
    note: row.note ?? '',
    updatedAt: row.updated_at,
  };
}

export function fetchTransactionBalanceAdjustments(): Promise<TransactionBalanceAdjustment[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('transaction_balance_adjustments').select('*');
    if (error) throw error;
    return (data as TransactionBalanceAdjustmentRow[]).map(fromRow);
  });
}

// Одна строка на (payer, currency) — upsert по этой паре (unique-констрейнт
// в базе), не отдельный insert/update: со стороны формы это всегда "задать
// текущий остаток", не важно, был он уже или нет.
export function upsertTransactionBalanceAdjustment(input: {
  payer: string;
  currency: Currency;
  amount: number;
  note: string;
}): Promise<TransactionBalanceAdjustment> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('transaction_balance_adjustments')
      .upsert(
        {
          payer: input.payer,
          currency: input.currency,
          amount: input.amount,
          note: input.note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'payer,currency' },
      )
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as TransactionBalanceAdjustmentRow);
  });
}

export function deleteTransactionBalanceAdjustment(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('transaction_balance_adjustments').delete().eq('id', id);
    if (error) throw error;
  });
}
