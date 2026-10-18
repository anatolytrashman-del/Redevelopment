-- Уникальные посетители без cookie (владелец, 2026-10-18).
-- Свой счётчик (page_views_daily) знает только просмотры и заходы, а
-- Vercel Web Analytics с 2026-10-16 видит всех через российский прокси как
-- один адрес из РФ. Здесь — подсчёт людей по схеме Plausible: отпечаток =
-- sha256(соль дня + IP + user-agent + сайт). IP берём из заголовков запроса
-- к Supabase (браузер ходит в Supabase напрямую, мимо прокси сайта).
-- Соль живёт одни сутки и удаляется: вчерашний отпечаток нельзя ни
-- сопоставить с сегодняшним, ни восстановить из него IP. На устройстве
-- посетителя ничего не хранится — согласие на cookie не нужно.

create table if not exists public.site_visitor_salts (
  day date primary key,
  salt text not null
);
alter table public.site_visitor_salts enable row level security;
-- Политик нет: соль видит только функция ниже (security definer).

create table if not exists public.site_visitor_hashes (
  day date not null,
  site text not null,
  hash text not null,
  primary key (day, site, hash)
);
alter table public.site_visitor_hashes enable row level security;

-- Агрегат для «Показателей»: люди за день по сайту и стране.
create table if not exists public.site_visitors_daily (
  day date not null,
  site text not null check (site in ('platform', 'malls', 'offices')),
  country text not null default '',
  visitors integer not null default 0,
  primary key (day, site, country)
);
alter table public.site_visitors_daily enable row level security;
drop policy if exists site_visitors_daily_read on public.site_visitors_daily;
create policy site_visitors_daily_read on public.site_visitors_daily for select using (true);
grant select on public.site_visitors_daily to anon, authenticated;

create or replace function public.track_site_visitor(p_site text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_ip text;
  v_ua text;
  v_country text;
  v_day date := (now() at time zone 'Europe/Minsk')::date;
  v_salt text;
  v_hash text;
  v_rows integer;
begin
  if p_site is null or p_site not in ('platform', 'malls', 'offices') then
    return;
  end if;
  v_ip := trim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1));
  v_ua := left(coalesce(v_headers ->> 'user-agent', ''), 400);
  if v_ip = '' then
    return;
  end if;
  v_country := upper(left(coalesce(v_headers ->> 'cf-ipcountry', ''), 2));
  if v_country !~ '^[A-Z]{2}$' or v_country = 'XX' then
    v_country := '';
  end if;

  insert into public.site_visitor_salts (day, salt)
    values (v_day, md5(random()::text || clock_timestamp()::text) || md5(random()::text))
    on conflict (day) do nothing;
  select salt into v_salt from public.site_visitor_salts where day = v_day;
  -- Старые соли и отпечатки не нужны: удаляем, чтобы связать дни было нечем.
  delete from public.site_visitor_salts where day < v_day;
  delete from public.site_visitor_hashes where day < v_day;

  v_hash := encode(sha256(convert_to(v_salt || '|' || v_ip || '|' || v_ua || '|' || p_site, 'UTF8')), 'hex');
  insert into public.site_visitor_hashes (day, site, hash)
    values (v_day, p_site, v_hash)
    on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return; -- этот человек сегодня уже посчитан
  end if;

  insert into public.site_visitors_daily as t (day, site, country, visitors)
    values (v_day, p_site, v_country, 1)
  on conflict (day, site, country) do update
    set visitors = t.visitors + 1;
end;
$$;

revoke all on function public.track_site_visitor(text) from public, anon, authenticated;
grant execute on function public.track_site_visitor(text) to anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
