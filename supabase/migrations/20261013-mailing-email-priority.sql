-- Адрес для рассылки: опт, иначе общие заказы, иначе общий ящик.
--
-- Владелец, 2026-10-13: у Сантехкомплекта (santech.ru) основным адресом
-- стоял order@santur.ru. Робот снял с главной три ящика с одной оценкой
-- (zakaz@, opt@, order@) и записал последний; чужой домен при этом не
-- отсекался. На странице почты Сатурна нет — это ошибка съёма.
--
-- Оценка (чем больше, тем лучше): свой домен важнее бесплатного ящика,
-- внутри — оптовые заказы (opt@), затем общий заказной (zakaz@/order@/
-- sales@), затем общий (info@/office@). Чужой корпоративный домен — 0,
-- в рассылку не берётся, пока есть хоть один нормальный адрес.
-- Карточку с живой перепиской не переписываем, если текущий адрес сам
-- пригоден (оценка > 0): менеджер, который уже отвечал, остаётся.

create or replace function public.supplier_email_domain(email text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(split_part(trim(coalesce(email, '')), '@', 2), '\.$', '')), '');
$$;

create or replace function public.supplier_email_is_freemail(domain text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(domain, '')) = any (array[
    'yandex.ru', 'ya.ru', 'yandex.com', 'yandex.by',
    'gmail.com', 'googlemail.com',
    'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'internet.ru',
    'rambler.ru', 'outlook.com', 'hotmail.com', 'live.com',
    'icloud.com', 'yahoo.com', 'proton.me', 'protonmail.com'
  ]);
$$;

-- Свой домен: совпал с сайтом, поддомен сайта или сайт — поддомен почты
-- (магазин.firma.ru и firma.ru). www снимается у хоста.
create or replace function public.supplier_email_on_site(email text, host text)
returns boolean
language sql
immutable
as $$
  select d <> '' and h <> '' and (
    d = h
    or right(d, length(h) + 1) = '.' || h
    or right(h, length(d) + 1) = '.' || d
  )
  from (
    select
      coalesce(public.supplier_email_domain(email), '') as d,
      regexp_replace(lower(trim(coalesce(host, ''))), '^www\.', '') as h
  ) x;
$$;

-- null — пусто или noreply. 0 — чужой корпоративный домен.
create or replace function public.supplier_mailing_email_score(email text, host text, label text default '')
returns int
language plpgsql
immutable
as $$
declare
  local text := lower(split_part(trim(coalesce(email, '')), '@', 1));
  lab text := lower(coalesce(label, ''));
  on_site boolean;
  free boolean;
  base int;
  bonus int;
begin
  if local = '' or position('@' in coalesce(email, '')) = 0 then
    return null;
  end if;
  -- Плюс-адреса (zakaz+46569@) и мусор съёма («mailto:info@», «%20info@»)
  -- не кандидаты. Уже записанный такой адрес просто не улучшаем им другой.
  if position('+' in local) > 0 or local ~ '[:% ]' then
    return null;
  end if;
  if local ~ '^(noreply|no-reply|donotreply|postmaster|abuse|webmaster)$' then
    return null;
  end if;
  on_site := public.supplier_email_on_site(email, host);
  free := public.supplier_email_is_freemail(public.supplier_email_domain(email));
  if not on_site and not free then
    return 0;
  end if;

  -- «opt» только как ящик (opt@, opt2@, opt-msk@), не как начало слова optical@.
  -- «mail» только как ящик (mail@, mail.msk@), не как логин mail4110@.
  if local ~ '^(opt|wholesale)([._+-]|[0-9]|$)' or local ~ '^optov' or lab ~ 'опт' then
    base := case when on_site then 300 else 280 end;
  elsif local ~ '(^|[._-])(zakupki|zakazy|zakaz|orders|order|sales|snab|commerce)([._+-]|[0-9]|$)'
     or local ~ '(zakaz|zakazy|zakupki)'
     or local ~ '^sale([._+-]|[0-9]|$)'
     or local ~ '^(torg|trade)([._+-]|$)'
     or lab ~ 'заказ' then
    base := case when on_site then 200 else 180 end;
  elsif local ~ '^(info|mail|office|post|hello|contact|admin)([._+-]|$)' or lab ~ 'общ' then
    base := case when on_site then 100 else 80 end;
  else
    base := case when on_site then 40 else 20 end;
  end if;

  bonus := case
    when local = any (array['opt','zakaz','zakazy','order','orders','sales','sale','info','office','mail','snab','zakupki']) then 20
    when local ~ '^(opt|zakaz|order|sales|info|office|mail)' then 10
    else 0
  end;
  return base + bonus + greatest(0, 15 - length(local));
end;
$$;

-- 3 опт, 2 общие заказы, 1 общий ящик, 0 свой/бесплатный без роли, -1 чужой или мусор.
-- Сравнивать рассылочный адрес нужно по ступени, не по сырой оценке:
-- sale@ не должен вытеснять order@ только потому, что короче.
create or replace function public.supplier_mailing_email_tier(email text, host text, label text default '')
returns int
language sql
immutable
as $$
  select case
    when s is null or s = 0 then -1
    when s >= 280 then 3
    when s >= 180 then 2
    when s >= 80 then 1
    else 0
  end
  from (select public.supplier_mailing_email_score(email, host, label) as s) x;
$$;

create or replace function public.apply_supplier_contact_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rival_rank int;
  offers_here int;
  landed boolean;
  new_score int;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  select count(*) into offers_here
    from supplier_research_offers o
   where supplier_site_host(o.website_url) = new.host;

  if offers_here = 0 then
    return new;
  end if;

  if new.kind = 'email' then
    new_score := public.supplier_mailing_email_score(new.value, new.host, '');
    if new_score is null or new_score = 0 then
      new.status := 'skipped';
      new.note := 'чужой домен или нерабочий ящик — в рассылку не берём';
      return new;
    end if;

    -- Строго лучше текущего. Равная оценка больше не затирает уже
    -- записанный адрес (из-за этого у santech.ru победил последний order@).
    -- Живая переписка защищает только пригодный адрес, не чужой домен.
    update supplier_research_offers o
       set email = new.value
     where supplier_site_host(o.website_url) = new.host
       and lower(coalesce(o.email, '')) <> lower(new.value)
       and public.supplier_mailing_email_tier(o.email, new.host, '') < public.supplier_mailing_email_tier(new.value, new.host, '')
       and not exists (
         select 1 from supplier_offer_emails e
          where e.offer_id = o.id and e.direction = 'in'
       );

    update suppliers s
       set email = new.value
     where s.deleted_at is null
       and s.website_host = new.host
       and lower(coalesce(s.email, '')) <> lower(new.value)
       and public.supplier_mailing_email_tier(s.email, new.host, '') < public.supplier_mailing_email_tier(new.value, new.host, '')
       and not exists (
         select 1
           from supplier_research_offers o
           join supplier_offer_emails e on e.offer_id = o.id and e.direction = 'in'
          where o.deleted_at is null
            and o.supplier_id = s.id
            and lower(trim(o.email)) = lower(trim(s.email))
       );

    select exists (
      select 1 from supplier_research_offers o
       where supplier_site_host(o.website_url) = new.host
         and lower(coalesce(o.email, '')) = lower(new.value)
    ) into landed;

    if not landed then
      new.status := 'skipped';
      new.note := 'уже записан адрес не хуже, либо карточка с живой перепиской';
      return new;
    end if;

    new.status := 'applied';
    new.applied_at := now();
    new.note := 'снято с сайта — записано автоматически';
    return new;
  end if;

  select max(coalesce(c.rank, 0)) into rival_rank
    from supplier_contact_captures c
   where c.host = new.host
     and c.kind = new.kind
     and coalesce(c.messenger_type, '') = coalesce(new.messenger_type, '')
     and c.id is distinct from new.id
     and c.status in ('pending', 'applied');

  if rival_rank is not null and rival_rank > coalesce(new.rank, 0) then
    new.status := 'skipped';
    new.note := 'не лучший вариант — у ' || new.host || ' записан контакт с более высокой оценкой';
    return new;
  end if;

  if new.kind = 'phone' then
    update supplier_research_offers o
       set contact = new.value,
           contact_method = 'Телефон'
     where supplier_site_host(o.website_url) = new.host
       and regexp_replace(coalesce(o.contact, ''), '\D', '', 'g') <> regexp_replace(new.value, '\D', '', 'g');
  else
    update supplier_research_offers o
       set messengers = (
             select coalesce(jsonb_agg(el), '[]'::jsonb)
               from jsonb_array_elements(coalesce(o.messengers, '[]'::jsonb)) el
              where el->>'type' is distinct from coalesce(new.messenger_type, '')
           ) || jsonb_build_array(jsonb_build_object('type', coalesce(new.messenger_type, ''), 'number', new.value))
     where supplier_site_host(o.website_url) = new.host
       and not exists (
         select 1 from jsonb_array_elements(coalesce(o.messengers, '[]'::jsonb)) el
          where el->>'type' = coalesce(new.messenger_type, '') and el->>'number' = new.value
       );
  end if;

  new.status := 'applied';
  new.applied_at := now();
  new.note := 'снято с сайта — записано автоматически';
  return new;
end $$;

-- Пересчёт уже записанных адресов. Кандидаты: снятые с сайта почты,
-- почты из разбора сайта и текущий адрес карточки. Берём максимальную
-- оценку. Чужой домен выбывает, как только есть свой или бесплатный ящик.
with caps as (
  select c.host, lower(trim(c.value)) as email, '' as label
    from supplier_contact_captures c
   where c.kind = 'email' and coalesce(trim(c.value), '') <> ''
),
profile as (
  select s.website_host as host,
         lower(trim(e->>'email')) as email,
         coalesce(e->>'label', '') as label
    from suppliers s
    cross join lateral jsonb_array_elements(coalesce(s.site_profile->'contacts'->'emails', '[]'::jsonb)) e
   where s.deleted_at is null
     and s.website_host is not null
     and coalesce(trim(e->>'email'), '') <> ''
),
current_offer as (
  select supplier_website_host(o.website_url) as host,
         lower(trim(o.email)) as email,
         '' as label
    from supplier_research_offers o
   where o.deleted_at is null and coalesce(trim(o.email), '') <> ''
),
scored as (
  select host, email, public.supplier_mailing_email_score(email, host, label) as score
    from (
      select * from caps
      union all
      select * from profile
      union all
      select * from current_offer
    ) c
   where host is not null
),
best as (
  select distinct on (host) host, email, score
    from scored
   where score is not null and score > 0
   order by host, score desc, length(email), email
),
-- Подпись из разбора сайта («заказы», «опт») учитывается и у текущего
-- адреса: иначе тот же ящик без подписи выглядит хуже самого себя.
labels as (
  select s.website_host as host, lower(trim(e->>'email')) as email, coalesce(e->>'label', '') as label
    from suppliers s
    cross join lateral jsonb_array_elements(coalesce(s.site_profile->'contacts'->'emails', '[]'::jsonb)) e
   where s.deleted_at is null and coalesce(trim(e->>'email'), '') <> ''
),
upd_suppliers as (
  update suppliers s
     set email = b.email
    from best b
   where s.deleted_at is null
     and s.website_host = b.host
     and lower(trim(s.email)) is distinct from b.email
     and public.supplier_mailing_email_tier(
           s.email, s.website_host,
           coalesce((select l.label from labels l where l.host = s.website_host and l.email = lower(trim(s.email)) limit 1), '')
         ) < public.supplier_mailing_email_tier(b.email, b.host, coalesce((select l.label from labels l where l.host = b.host and l.email = b.email limit 1), ''))
     and not exists (
       select 1
         from supplier_research_offers o
         join supplier_offer_emails e on e.offer_id = o.id and e.direction = 'in'
        where o.deleted_at is null
          and o.supplier_id = s.id
          and lower(trim(o.email)) = lower(trim(s.email))
     )
  returning s.id
),
upd_offers as (
  update supplier_research_offers o
     set email = b.email
    from best b
   where o.deleted_at is null
     and supplier_website_host(o.website_url) = b.host
     and lower(trim(o.email)) is distinct from b.email
     and public.supplier_mailing_email_tier(
           o.email, b.host,
           coalesce((select l.label from labels l where l.host = b.host and l.email = lower(trim(o.email)) limit 1), '')
         ) < public.supplier_mailing_email_tier(b.email, b.host, coalesce((select l.label from labels l where l.host = b.host and l.email = b.email limit 1), ''))
     and not exists (
       select 1 from supplier_offer_emails e
        where e.offer_id = o.id and e.direction = 'in'
     )
  returning o.id
)
select
  (select count(*) from upd_suppliers) as suppliers_updated,
  (select count(*) from upd_offers) as offers_updated;

-- Убрать из списка контактов чужие домены, если у компании уже есть
-- нормальный адрес. Сатурн у Сантехкомплекта больше не показывается.
update suppliers s
   set site_profile = jsonb_set(
     s.site_profile,
     '{contacts,emails}',
     coalesce((
       select jsonb_agg(e)
         from jsonb_array_elements(s.site_profile->'contacts'->'emails') e
        where public.supplier_mailing_email_score(e->>'email', s.website_host, coalesce(e->>'label', '')) is distinct from 0
     ), '[]'::jsonb)
   )
 where s.deleted_at is null
   and s.website_host is not null
   and jsonb_typeof(s.site_profile->'contacts'->'emails') = 'array'
   and exists (
     select 1
       from jsonb_array_elements(s.site_profile->'contacts'->'emails') e
      where public.supplier_mailing_email_score(e->>'email', s.website_host, coalesce(e->>'label', '')) = 0
   )
   and exists (
     select 1
       from jsonb_array_elements(s.site_profile->'contacts'->'emails') e
      where coalesce(public.supplier_mailing_email_score(e->>'email', s.website_host, coalesce(e->>'label', '')), 0) > 0
   );

update supplier_contact_captures c
   set status = 'skipped',
       note = 'чужой домен — в рассылку не берём'
 where c.kind = 'email'
   and c.status = 'applied'
   and public.supplier_mailing_email_score(c.value, c.host, '') = 0;

notify pgrst, 'reload schema';
