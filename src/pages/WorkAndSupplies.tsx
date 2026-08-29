import { useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Contractors } from './Contractors';
import { Suppliers } from './Suppliers';

// Владелец, 2026-08-29: "Сейчас подрядчик добавляется на одной странице,
// а потом надо идти в закупки, это уже со старта неудобно... думаю, что
// саму идею закупок и подрядчиков можно перемещать на одну страницу,
// просто разные вкладки — Работы и Материалы". Слияние трёх бывших
// отдельных страниц (Подрядчики, Поставщики, Закупки) в одну — сама
// логика каждой не переписана, компоненты переиспользованы как есть
// с новым проп embedded (см. Contractors.tsx/Suppliers.tsx/Purchases.tsx),
// который просто прячет их собственный PageHeader.
//
// "Работы" = Contractors.tsx как есть (там уже есть свои вкладки
// Команда/Ресерч). "Материалы" = Suppliers.tsx как есть (там уже есть
// Каталог/Ресерч/Закупки — третья вкладка добавлена этим же слиянием,
// рендерит Purchases.tsx).
const TOP_TABS = ['Работы', 'Материалы'] as const;
type TopTab = (typeof TOP_TABS)[number];

export function WorkAndSupplies() {
  const [topTab, setTopTab] = useState<TopTab>('Работы');

  return (
    <>
      <PageHeader title="Подрядчики и закупки" />
      <div className="mb-6">
        <ToggleGroup options={[...TOP_TABS]} value={topTab} onChange={(v) => setTopTab(v as TopTab)} />
      </div>

      {topTab === 'Работы' && <Contractors embedded />}
      {topTab === 'Материалы' && <Suppliers embedded />}
    </>
  );
}
