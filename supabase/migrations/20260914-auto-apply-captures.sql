-- Снятое с сайта записывается в карточку само, без выбора руками.
--
-- Владелец, 2026-09-14: «Я не собираюсь ничего делать с этим. Всё, что мы
-- собрали с сайта, по умолчанию более актуально, чем то, что было в базе до
-- этого. И всё, где прошёлся мой скрипт и мы собрали каталог + контакты,
-- помечай как верифицированного».
--
-- До этой миграции снятый контакт подставлялся только в ПУСТОЕ поле, а
-- расхождение с заполненным висело предложением «выберите верное» на вкладке
-- «Верификация» (см. SupplierVerificationTab.tsx). Смысл в этом был, пока
-- контакты снимали поштучно; после робота (scripts/harvest.mjs), который
-- проходит всю базу, таких вопросов накопилось ~1800 — чистая ручная работа
-- с заранее известным ответом.
--
-- Почему триггером в базе, а не только на фронте: снятое приходит из трёх
-- мест (закладка в админке, robot scripts/harvest.mjs на машине владельца,
-- ручные правки), и робот работает прямо сейчас — правка фронта доехала бы
-- до прода только со следующей публикацией очереди. База — единственная
-- общая точка для всех трёх путей.
--
-- Прав это никому не добавляет: писать в supplier_contact_captures и в
-- supplier_research_offers может одна и та же роль authenticated (см.
-- политики authenticated_all), security definer нужен только чтобы правило
-- не зависело от порядка политик.

-- «Каталог + контакты собраны» = есть снимок меню и есть снятый контакт.
-- Владелец, 2026-09-14: такого поставщика помечаем верифицированным без
-- ручного прохода очереди — руками там всё равно сверяли ровно эти два
-- факта.
create or replace function public.verify_supplier_offers_with_captures(target_host text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(target_host, '') = '' then
    return;
  end if;
  if not exists (select 1 from supplier_menu_captures m where m.host = target_host) then
    return;
  end if;
  if not exists (select 1 from supplier_contact_captures c where c.host = target_host) then
    return;
  end if;
  update supplier_research_offers o
     set verified = true
   where supplier_site_host(o.website_url) = target_host
     and coalesce(o.verified, false) = false;
end $$;

-- Хост в карточке не хранится, он считается из website_url, а правило ниже
-- ищет карточки именно по нему на каждую снятую строку — робот присылает их
-- тысячами. Индекс по тому же выражению превращает этот поиск в один доступ.
create index if not exists supplier_research_offers_site_host_idx
  on supplier_research_offers (supplier_site_host(website_url));

-- Лучший вариант на «хост + вид контакта» выбирается по rank, который
-- считает сама закладка (ящик закупок выше общего info@, городской номер
-- выше 8-800) — см. tools/menu-bookmarklet/contacts.js.
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
begin
  -- Гвард от рекурсии: функция сама переводит строки в applied/skipped, и на
  -- этот UPDATE триггер приходит второй раз. Всё, что не pending, проходит
  -- насквозь.
  if new.status is distinct from 'pending' then
    return new;
  end if;

  select count(*) into offers_here
    from supplier_research_offers o
   where supplier_site_host(o.website_url) = new.host;

  -- Снято с сайта, которого нет ни в одной карточке: оставляем как есть —
  -- карточку могут завести позже, и тогда контакт пригодится.
  if offers_here = 0 then
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

  if new.kind = 'email' then
    -- Единственное исключение из «снятое актуальнее»: карточка с живой
    -- перепиской. Там адрес подтверждён ответом самого поставщика, и
    -- переписка ведётся с конкретным менеджером (mm4@ против mm6@ у
    -- Авангарда) — молча увести её на общий ящик с сайта дороже, чем
    -- оставить как есть. Тот же выбор владелец сделал при обнулении
    -- контактов 2026-09-14: 127 карточек с перепиской не тронули.
    update supplier_research_offers o
       set email = new.value
     where supplier_site_host(o.website_url) = new.host
       and lower(coalesce(o.email, '')) <> lower(new.value)
       and not (
         coalesce(o.email, '') <> ''
         and exists (select 1 from supplier_offer_emails e where e.offer_id = o.id and e.direction = 'in')
       );

    select exists (
      select 1 from supplier_research_offers o
       where supplier_site_host(o.website_url) = new.host
         and lower(coalesce(o.email, '')) = lower(new.value)
    ) into landed;

    if not landed then
      new.status := 'skipped';
      new.note := 'карточка с живой перепиской — адрес из ответа поставщика оставлен';
      return new;
    end if;

  elsif new.kind = 'phone' then
    -- Сравнение по цифрам: «+7 495 120-24-13» и «+7 (495) 120-24-13» — один
    -- номер, переписывать оформление незачем.
    update supplier_research_offers o
       set contact = new.value,
           contact_method = 'Телефон'
     where supplier_site_host(o.website_url) = new.host
       and regexp_replace(coalesce(o.contact, ''), '\D', '', 'g') <> regexp_replace(new.value, '\D', '', 'g');

  else
    -- Мессенджер того же типа заменяем, а не добавляем вторым (кейс «Альбия»,
    -- 2026-09-14: один и тот же Max записался двумя видами).
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

-- Остальные варианты того же вида закрываются уже AFTER: вопрос «какой
-- верный» больше не задаётся, а строки остаются в базе со своим rank и
-- page_url. Именно AFTER, а не хвост функции выше: BEFORE-триггер, который
-- правит СОСЕДНИЕ строки своей же таблицы, падает с «tuple to be updated was
-- already modified», как только один UPDATE задевает несколько снятых строк
-- разом (ловится на прогоне накопленного хвоста).
create or replace function public.close_supplier_contact_capture_rivals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update supplier_contact_captures c
     set status = 'skipped',
         note = 'не лучший вариант, записан ' || new.value
   where c.status = 'pending'
     and c.host = new.host
     and c.kind = new.kind
     and coalesce(c.messenger_type, '') = coalesce(new.messenger_type, '')
     and c.id is distinct from new.id;

  perform verify_supplier_offers_with_captures(new.host);
  return null;
end $$;

create or replace function public.verify_after_menu_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform verify_supplier_offers_with_captures(new.host);
  return new;
end $$;

drop trigger if exists supplier_contact_captures_auto_apply on supplier_contact_captures;
create trigger supplier_contact_captures_auto_apply
  before insert or update on supplier_contact_captures
  for each row execute function apply_supplier_contact_capture();

drop trigger if exists supplier_contact_captures_close_rivals on supplier_contact_captures;
create trigger supplier_contact_captures_close_rivals
  after insert or update on supplier_contact_captures
  for each row when (new.status = 'applied') execute function close_supplier_contact_capture_rivals();

drop trigger if exists supplier_menu_captures_verify on supplier_menu_captures;
create trigger supplier_menu_captures_verify
  after insert on supplier_menu_captures
  for each row execute function verify_after_menu_capture();

notify pgrst, 'reload schema';
