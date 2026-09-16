// НДС как данные, а не как кнопка «×1,22» (шаг 7 плана
// docs/procurement-product-steps.md).
//
// Откуда взялась проблема. Поставщики выставляют счета по-разному: у одних
// в строках цены с НДС, у других — без, а итог с НДС (реальный случай
// МаксиКерам, 2026-09-15: без пересчёта поставщик выглядел на 22% дешевле
// остальных и получал бейдж лучшей цены ни за что). Раньше это чинила
// кнопка «+22% НДС» в форме сопоставления: закупщица сама замечала приписку
// «без НДС» и сама умножала. Заметила — цифры сходятся, не заметила —
// сравнение врёт, и по нему принимают решение о закупке.
//
// Теперь ставка — данные: её называет сам счёт (QuoteTerms.vatIncluded/
// vatRate, распознаются из документа и письма), а если не назвал — берётся
// по стране юрлица, от которого идёт закупка (LegalEntity.country).
// Пересчитанная цена помечается в сравнении, чтобы было видно, что число не
// из документа, а посчитано.
export const VAT_RATE_BY_COUNTRY: Record<string, number> = {
  'Россия': 22,
  'Беларусь': 20,
  'Казахстан': 12,
};

// Ставка по стране. null — страна незнакомая или не указана: тогда пересчёт
// НЕ делается вовсе, и цена без НДС остаётся ценой без НДС с пометкой. Это
// намеренно: занизить чужую цену на 20% хуже, чем показать «НДС не указан».
export function vatRateForCountry(country: string | null | undefined): number | null {
  const key = String(country ?? '').trim();
  if (!key) return null;
  return VAT_RATE_BY_COUNTRY[key] ?? null;
}

export interface VatBasis {
  // Включён ли НДС в цену. null — неизвестно (счёт молчит): к «без НДС» это
  // не приравнивается, см. комментарий к grossUp.
  vatIncluded?: boolean | null;
  vatRate?: number | null;
}

export interface GrossUpResult {
  price: number;
  // Ставка, по которой считали (null — не считали).
  rate: number | null;
  // Цена пересчитана из «без НДС» — значит, это НЕ число из документа.
  adjusted: boolean;
  // Про НДС ничего не известно: ни счёт, ни страна не дали ответа. Цена
  // оставлена как есть, но полагаться на неё в сравнении нельзя.
  unknown: boolean;
}

// Цена «с НДС» из цены счёта.
//
// Правило неизвестности: если счёт не сказал про НДС ничего, мы НЕ
// подставляем ставку по стране и не пересчитываем. Молчание счёта чаще
// значит «цены и так с НДС» (так выставляет большинство), и накрутить сверху
// ещё 22% значило бы завысить цену на ровном месте. Ставка по стране нужна
// в другом случае: счёт прямо сказал «без НДС», а ставку не назвал.
export function grossUp(price: number, basis: VatBasis | null | undefined, countryRate: number | null): GrossUpResult {
  const included = basis?.vatIncluded ?? null;
  const ownRate = typeof basis?.vatRate === 'number' && basis.vatRate > 0 ? basis.vatRate : null;
  if (included === true) return { price, rate: ownRate, adjusted: false, unknown: false };
  if (included === false) {
    const rate = ownRate ?? countryRate;
    if (rate == null) return { price, rate: null, adjusted: false, unknown: true };
    return { price: Math.round(price * (1 + rate / 100) * 100) / 100, rate, adjusted: true, unknown: false };
  }
  return { price, rate: ownRate, adjusted: false, unknown: true };
}

// Как объяснить пересчёт человеку — одной строкой под ценой.
export function vatExplanation(result: GrossUpResult): string {
  if (result.adjusted) return `цена из счёта без НДС, пересчитана с НДС ${result.rate}%`;
  if (result.unknown) return 'про НДС в счёте не сказано — цена как в документе';
  return result.rate != null ? `цена с НДС ${result.rate}%` : 'цена с НДС';
}
