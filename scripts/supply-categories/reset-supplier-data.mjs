#!/usr/bin/env node
// Обнуление категорий и недостоверных контактов поставщиков — разовая
// операция 2026-09-14. Владелец: «я бы на твоём месте очистил вообще всю
// инфу по контактам и категориям поставщика, будем записывать её с нуля
// через кнопки».
//
// Что делает (в этом порядке):
//   1. Копирует текущие значения в две таблицы-бэкапа с датой в имени —
//      операция необратимая, и вернуть должно быть можно.
//   2. Обнуляет categories у ВСЕХ снимков сайтов и снимает
//      categories_verified: категории теперь приезжают со снятого меню.
//   3. Стирает контакты (email, телефон, мессенджеры, contact_source) у всех
//      карточек, КРОМЕ тех, где есть живая переписка: там адрес подтверждён
//      тем, что поставщик реально ответил, и выкидывать его глупо.
//
//   node scripts/supply-categories/reset-supplier-data.mjs --dry
//   node scripts/supply-categories/reset-supplier-data.mjs --confirm
import { parseArgs, query } from './lib.mjs';

const { named } = parseArgs();
const stamp = '20260914';

async function counts() {
  const [row] = await query(`
    select
      (select count(*) from supplier_research_offers) as offers,
      (select count(*) from supplier_research_offers where coalesce(email,'') <> '') as with_email,
      (select count(distinct offer_id) from supplier_offer_emails) as with_mail_thread,
      (select count(*) from supplier_site_snapshots where coalesce(array_length(categories,1),0) > 0) as snapshots_with_categories
  `);
  return row;
}

async function main() {
  const before = await counts();
  console.log('до:', before);

  if (!named.confirm) {
    console.log('это пробный прогон, ничего не меняли. Для записи: --confirm');
    return;
  }

  // 1. Бэкапы. create table as select — обычные таблицы, без RLS-политик:
  // читать их будет только Management API из сессии, фронт про них не знает.
  await query(`
    create table if not exists supplier_contacts_backup_${stamp} as
    select id, name, website_url, email, contact, contact_method, messengers, contact_source, now() as backed_up_at
    from supplier_research_offers
  `);
  await query(`
    create table if not exists supplier_categories_backup_${stamp} as
    select host, categories, categories_verified, now() as backed_up_at
    from supplier_site_snapshots
  `);
  const [backup] = await query(`
    select (select count(*) from supplier_contacts_backup_${stamp}) as contacts,
           (select count(*) from supplier_categories_backup_${stamp}) as categories
  `);
  console.log('бэкап:', backup);

  // 2. Категории — у всех.
  const cats = await query(`
    update supplier_site_snapshots
    set categories = '{}', categories_verified = false
    where coalesce(array_length(categories, 1), 0) > 0 or categories_verified
    returning host
  `);
  console.log(`категорий обнулено у снимков: ${cats.length}`);

  // 3. Контакты — всем, кроме карточек с перепиской.
  const contacts = await query(`
    update supplier_research_offers o
    set email = '', contact = '', contact_method = 'Телефон', messengers = '[]'::jsonb, contact_source = ''
    where not exists (select 1 from supplier_offer_emails e where e.offer_id = o.id)
      and (coalesce(o.email,'') <> '' or coalesce(o.contact,'') <> '' or coalesce(o.messengers::text,'[]') <> '[]')
    returning o.id
  `);
  console.log(`контактов стёрто у карточек: ${contacts.length}`);

  console.log('после:', await counts());
}

await main();
