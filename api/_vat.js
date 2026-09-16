// НДС на серверной стороне — близнец src/data/vat.ts (шаг 7 плана
// docs/procurement-product-steps.md).
//
// Почему копия, а не общий модуль: api/*.js — голый JS без сборки, импортировать
// оттуда TypeScript нельзя. Правила простые и меняются редко, но если правится
// одна сторона — правится и вторая; расхождение будет означать, что счёт,
// записанный автоматически, и тот же счёт, подтверждённый руками, дадут разные
// цены. Файл с «_» в начале — общий хелпер, в лимит 12 функций Vercel Hobby не
// считается.
export const VAT_RATE_BY_COUNTRY = {
  'Россия': 22,
  'Беларусь': 20,
  'Казахстан': 12,
};

export function vatRateForCountry(country) {
  const key = String(country ?? '').trim();
  if (!key) return null;
  return VAT_RATE_BY_COUNTRY[key] ?? null;
}

// Цена «с НДС» из цены счёта. Молчание счёта про НДС НЕ считается «без НДС»:
// большинство выставляет уже с НДС, и накрутить сверху ещё 22% значило бы
// завысить цену на ровном месте (см. подробный разбор в src/data/vat.ts).
export function grossUp(price, basis, countryRate) {
  const included = basis && typeof basis.vatIncluded === 'boolean' ? basis.vatIncluded : null;
  const ownRate = basis && typeof basis.vatRate === 'number' && basis.vatRate > 0 ? basis.vatRate : null;
  if (included === true) return { price, rate: ownRate, adjusted: false, unknown: false };
  if (included === false) {
    const rate = ownRate ?? countryRate ?? null;
    if (rate == null) return { price, rate: null, adjusted: false, unknown: true };
    return { price: Math.round(price * (1 + rate / 100) * 100) / 100, rate, adjusted: true, unknown: false };
  }
  return { price, rate: ownRate, adjusted: false, unknown: true };
}
