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

// Переключатели валют на публичных страницах гида района (первичный/
// вторичный рынок) сводят всё к EUR как общему знаменателю (см.
// DistrictGuidePage.tsx) — эти два хелпера переводят сумму в EUR туда и
// обратно через тот же BYN-мостик, что и convertToUsd выше, только не
// жёстко на доллар, а на произвольную целевую валюту.
export function convertToEur(amount: number, currency: Currency, rate: ExchangeRate | null): number | null {
  if (currency === 'EUR') return amount;
  if (!rate) return null;
  const bynPerUnit = currency === 'BYN' ? 1 : currency === 'USD' ? rate.usdByn : rate.rubByn;
  const amountByn = amount * bynPerUnit;
  return amountByn / rate.eurByn;
}

export function convertFromEur(amountEur: number, target: Currency, rate: ExchangeRate | null): number | null {
  if (target === 'EUR') return amountEur;
  if (!rate) return null;
  const amountByn = amountEur * rate.eurByn;
  if (target === 'BYN') return amountByn;
  return amountByn / (target === 'USD' ? rate.usdByn : rate.rubByn);
}
