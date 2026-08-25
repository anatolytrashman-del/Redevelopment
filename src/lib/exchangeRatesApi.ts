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

// Для ПУБЛИЧНЫХ страниц (гид района): как fetchTodayRate, но при недоступном
// /api/exchange-rate падает не в ошибку, а на последний закэшированный курс
// из Supabase. Две причины: (1) build-time пререндер (scripts/prerender.mjs)
// гоняет страницу через `vite preview`, где Vercel-функций нет вовсе — без
// фолбэка цены в снапшоте для поисковиков навсегда оставались бы «—»;
// (2) живому посетителю лучше вчерашний курс, чем прочерки. В админских
// потоках (Транзакции — фиксация курса на дату сохранения) НЕ использовать:
// там подмена сегодняшнего курса вчерашним молча исказила бы данные.
export async function fetchTodayRateOrLatestCached(): Promise<ExchangeRate> {
  try {
    return await fetchTodayRate();
  } catch (apiError) {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('*')
      .order('date', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) throw apiError;
    return fromRow(data[0] as ExchangeRateRow);
  }
}
