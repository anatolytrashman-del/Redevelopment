-- Условия поставки как данные, а не текст (шаг 6 плана
-- docs/procurement-product-steps.md).
--
-- Зачем. Сейчас «доставка бесплатно от 50 000 ₽, срок 5 дней, предоплата
-- 100 %» живёт одной строкой в supplier_research_offers.terms_note, которую
-- закупщик перепечатывает руками из письма. Сравнить два КП по сроку или
-- посчитать «цена + доставка» по такому тексту нельзя — а решение о выборе
-- поставщика принимают ровно по этим трём числам, не только по цене.
--
-- Поле на КП, а не на карточке: условия относятся к конкретному
-- предложению. Один и тот же поставщик в марте возит за свой счёт, а в
-- сентябре — за 8 000 ₽, и старое КП должно помнить свои условия.
alter table supplier_offer_quotes add column if not exists terms jsonb;

comment on column supplier_offer_quotes.terms is
  'Условия поставки этого КП: {deliveryCost, deliveryTerms, leadTimeDays, availability, prepaymentPercent, validUntil, minOrder, vatIncluded, vatRate}. NULL — условий не нашли.';

notify pgrst, 'reload schema';
