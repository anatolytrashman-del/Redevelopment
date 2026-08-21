import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { ExchangeRate, ExchangeRateRow } from '../data/exchangeRates';

function fromRow(row: ExchangeRateRow): ExchangeRate {
  return {
    date: row.date,
    usdByn: Number(row.usd_byn),
    eurByn: Number(row.eur_byn),
    rubByn: Number(row.rub_byn),
  };
}

// Все закэшированные курсы — для отчёта (конвертация каждой транзакции по
// её собственной rate_date). Таблица маленькая (по строке на день, когда
// кто-то сохранял транзакцию), тянуть всё разом дешевле, чем по одной штуке.
export function fetchExchangeRates(): Promise<ExchangeRate[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('exchange_rates').select('*').order('date', { ascending: true });
    if (error) throw error;
    return (data as ExchangeRateRow[]).map(fromRow);
  });
}

// Курс на сегодня — с кэшем и запросом к bnb.by при промахе (см.
// api/exchange-rate.js). Вызывается при создании новой транзакции: курс
// фиксируется на дату сохранения, а не на дату самой транзакции, потому что
// у bnb.by нет архива курсов по прошлым датам.
export async function fetchTodayRate(): Promise<ExchangeRate> {
  const res = await fetch('/api/exchange-rate');
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Не удалось получить курс валют');
  }
  return res.json();
}
