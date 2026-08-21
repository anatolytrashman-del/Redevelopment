// Курс USD/EUR/RUB к BYN на конкретный календарный день — см. api/exchange-rate.js.
// Источник — вкладка "Курсы НБ РБ" на bnb.by; таблица кэширует по одной
// строке на день, когда кто-то реально сохранял транзакцию, а не полную
// ежедневную историю (у bnb.by нет архива по датам, только "на сегодня").
export interface ExchangeRate {
  date: string; // YYYY-MM-DD
  usdByn: number;
  eurByn: number;
  rubByn: number;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/exchangeRatesApi.ts
export interface ExchangeRateRow {
  date: string;
  usd_byn: number;
  eur_byn: number;
  rub_byn: number;
  fetched_at: string;
}
