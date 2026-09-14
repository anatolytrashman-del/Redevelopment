#!/usr/bin/env node
// Отметка «верифицирован» по факту РАСПОЗНАВАНИЯ. Владелец, 2026-09-14:
// «всё, что не распозналось, закидывай во вторую очередь… а всё, что
// распозналось, помечай верифицированным».
//
// Уточнение прежнего критерия (scripts/verify-harvested.mjs): там хватало
// снятого меню и контактов, здесь нужен результат — у поставщика есть
// товарные группы. Сайт, с которого робот принёс одну строку меню и ничего
// не разложилось, отметку теряет: он не разобран, а лежит во второй
// очереди и ждёт съёма руками.
//
//   node scripts/verify-recognized.mjs --dry
//   node scripts/verify-recognized.mjs --confirm
import { parseArgs, query } from './supply-categories/lib.mjs';

const { named } = parseArgs();

const HOST = `lower(split_part(regexp_replace(trim(website_url), '^(https?://)?(www\\.)?', ''), '/', 1))`;
const РАСПОЗНАНО = `select host from supplier_site_snapshots where coalesce(array_length(categories, 1), 0) > 0`;

const [before] = await query(`
  select
    (select count(*) from (${РАСПОЗНАНО}) t) as распознано_хостов,
    (select count(*) from supplier_research_offers where not verified and ${HOST} in (${РАСПОЗНАНО})) as поставить,
    (select count(*) from supplier_research_offers where verified and ${HOST} not in (${РАСПОЗНАНО})) as снять
`);
console.log(before);

if (!named.confirm) {
  console.log('пробный прогон. Для записи: --confirm');
} else {
  const up = await query(`
    update supplier_research_offers set verified = true
    where not verified and ${HOST} in (${РАСПОЗНАНО}) returning id
  `);
  const down = await query(`
    update supplier_research_offers set verified = false
    where verified and ${HOST} not in (${РАСПОЗНАНО}) returning id
  `);
  console.log(`отмечено: ${up.length}, снято: ${down.length}`);
}
