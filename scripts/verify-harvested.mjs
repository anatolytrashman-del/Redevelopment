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
import { LOG_VERIFIED_SQL, parseArgs, query } from './supply-categories/lib.mjs';

const { named } = parseArgs();

const HOSTS = `
  select m.host from supplier_menu_captures m
  where m.status <> 'skipped'
    and exists (select 1 from supplier_contact_captures c where c.host = m.host)
  group by m.host
`;

// Почта обязательна для верификации (владелец, 2026-09-15, по карточке
// magmastones.ru: сайт открылся и каталог снялся, но с него сняли только
// телефон и мессенджер — верифицировать такого нельзя, писать ему нечем).
// То же условие в базе: verify_supplier_offers_with_captures, миграция
// 20260915-verify-requires-email.sql.
const WHERE = `
  not verified
  and coalesce(trim(email), '') <> ''
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
  // Отметка и запись в activity_log одним запросом — каждая карточка,
  // верифицированная роботом, идёт на баланс ИИ-закупщика на /admin/metrics
  // (см. AI_BUYER_NAME в lib.mjs).
  const rows = await query(`
    with up as (update supplier_research_offers set verified = true where ${WHERE} returning id)
    ${LOG_VERIFIED_SQL}
  `);
  console.log(`отмечено карточек: ${rows.length}`);
}
