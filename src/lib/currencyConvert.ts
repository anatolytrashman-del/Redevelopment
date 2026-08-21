import type { Currency } from '../data/transactions';
import type { ExchangeRate } from '../data/exchangeRates';

// Переводит сумму в валюте транзакции в доллары по курсу, зафиксированному
// на конкретную дату (см. rate_date в data/transactions.ts). BYN — общий
// знаменатель: конвертируем в BYN по курсу нужной валюты, потом в USD по
// курсу доллара того же дня. null — курса на эту дату нет в кэше (не должно
// происходить после бэкафилла, но на всякий случай не считаем это нулём).
export function convertToUsd(amount: number, currency: Currency, rate: ExchangeRate | undefined): number | null {
  if (currency === 'USD') return amount;
  if (!rate) return null;
  const bynPerUnit = currency === 'BYN' ? 1 : currency === 'EUR' ? rate.eurByn : rate.rubByn;
  const amountByn = amount * bynPerUnit;
  return amountByn / rate.usdByn;
}
