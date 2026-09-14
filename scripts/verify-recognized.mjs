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
import { LOG_VERIFIED_SQL, parseArgs, query } from './supply-categories/lib.mjs';

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
  // Отметка и запись в activity_log одним запросом — каждая карточка,
  // верифицированная роботом, идёт на баланс ИИ-закупщика на /admin/metrics
  // (см. AI_BUYER_NAME в lib.mjs). Снятие отметки ниже не логируется:
  // отдельного действия «разверифицировал» в логе нет, а вычитать из
  // счётчика владелец не просил.
  const up = await query(`
    with up as (
      update supplier_research_offers set verified = true
      where not verified and ${HOST} in (${РАСПОЗНАНО}) returning id
    )
    ${LOG_VERIFIED_SQL}
  `);
  const down = await query(`
    update supplier_research_offers set verified = false
    where verified and ${HOST} not in (${РАСПОЗНАНО}) returning id
  `);
  console.log(`отмечено: ${up.length}, снято: ${down.length}`);
}
