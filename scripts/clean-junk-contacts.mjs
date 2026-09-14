#!/usr/bin/env node
// Разовая чистка мусора, который закладка «Снять контакты» v2 набрала до
// правки фильтров (первый прогон робота, 2026-09-14).
//
// Что убираем и почему:
//   - «телефоны» с невозможным кодом: в России код начинается на 3, 4, 8 или
//     9. «+7 (023) 392-33-89» и «+7 (546) 533-08-45» — это ГОСТы и артикулы
//     из описаний товаров, случайно похожие на номер;
//   - заглушки из масок полей ввода: «+7 (999) 999-99-99»;
//   - ссылки «поделиться страницей» t.me/share — это кнопка шаринга, а не
//     контакт поставщика.
// Сами правила уже стоят в tools/menu-bookmarklet/contacts.js, так что
// заново это не наберётся; здесь только прибираем уже записанное.
//
//   node scripts/clean-junk-contacts.mjs --dry
//   node scripts/clean-junk-contacts.mjs --confirm
import { parseArgs, query } from './supply-categories/lib.mjs';

const { named } = parseArgs();

const WHERE = `
  status = 'pending' and (
    (kind = 'phone' and regexp_replace(value, '\\D', '', 'g') ~ '^7[0-2]')
    or (kind = 'phone' and regexp_replace(value, '\\D', '', 'g') ~ '^7[5-7]')
    or (kind = 'phone' and regexp_replace(value, '\\D', '', 'g') ~ '^7(\\d)\\1{9}$')
    or (kind = 'messenger' and value ilike '%t.me/share%')
    -- почта, слипшаяся с хвостом телефона: «137-65-60contacts@idg-deco.ru»
    or (kind = 'email' and value ~ '^\\d[\\d-]{4,}[A-Za-z]')
  )
`;

const rows = await query(`select host, kind, value from supplier_contact_captures where ${WHERE} order by host`);
for (const r of rows) console.log(`${r.host} — ${r.kind}: ${r.value}`);
console.log(`под чистку: ${rows.length}`);

if (!named.confirm) {
  console.log('пробный прогон, ничего не удалено. Для записи: --confirm');
} else {
  const gone = await query(`delete from supplier_contact_captures where ${WHERE} returning id`);
  console.log(`удалено: ${gone.length}`);
}
