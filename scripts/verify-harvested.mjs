#!/usr/bin/env node
// Отметка «верифицирован» по факту успешного съёма. Владелец, 2026-09-14:
// «те сайты, по которым у нас совпали условия: 1) сайт открылся, 2) мы
// получили каталог, 3) мы получили контакты — ставь верификацию. Всё равно
// это не финал, мы будем ещё писать письма, получать счета и иначе
// верифицировать, но сейчас этого точно хватит».
//
// Раньше эта отметка означала «человек посмотрел карточку и подтвердил».
// Теперь у неё второе, более слабое основание: сайт жив, каталог снят,
// контакты найдены. Это осознанное решение владельца, а не подмена смысла:
// настоящая проверка — переписка и счёт — впереди, а до неё отметка нужна,
// чтобы отличать разобранных поставщиков от неразобранных.
//
//   node scripts/verify-harvested.mjs --dry
//   node scripts/verify-harvested.mjs --confirm
import { parseArgs, query } from './supply-categories/lib.mjs';

const { named } = parseArgs();

const HOSTS = `
  select m.host from supplier_menu_captures m
  where m.status <> 'skipped'
    and exists (select 1 from supplier_contact_captures c where c.host = m.host)
  group by m.host
`;

const WHERE = `
  not verified
  and lower(split_part(regexp_replace(trim(website_url), '^(https?://)?(www\\.)?', ''), '/', 1)) in (${HOSTS})
`;

const [before] = await query(`
  select
    (select count(*) from (${HOSTS}) t) as снято_полностью,
    (select count(*) from supplier_research_offers where ${WHERE}) as ждут_отметки,
    (select count(*) from supplier_research_offers where verified) as уже_отмечено
`);
console.log(before);

if (!named.confirm) {
  console.log('пробный прогон. Для записи: --confirm');
} else {
  const rows = await query(`update supplier_research_offers set verified = true where ${WHERE} returning id`);
  console.log(`отмечено карточек: ${rows.length}`);
}
