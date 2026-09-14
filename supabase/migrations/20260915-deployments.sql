-- Журнал прод-деплоев — источник метрики «релизов на прод» у ИИ-кодера
-- (Claude Code) на /admin/metrics.
--
-- Владелец, 2026-09-15: «можем вывести метрику по количеству деплоев на
-- страницу метрики для ИИ-сотрудника Claude Code». У Claude Code, в отличие
-- от людей и ИИ-закупщика, нет следов в activity_log — он не жмёт кнопки в
-- админке, он пишет код и публикует релизы. Единственное его измеримое
-- действие в проде — деплой, поэтому под него отдельная таблица.
--
-- Почему не ходим в Vercel API из фронта/функции: (1) это потребовало бы
-- класть VERCEL_TOKEN (права на весь аккаунт) в env прода, (2) Vercel хранит
-- историю деплоев ограниченно — метрика «за прошлый месяц» через год была бы
-- пустой. Пишем сами: последним шагом прод-сборки (scripts/record-deployment.mjs,
-- см. npm run build) вставляется строка от service-role ключа. История до
-- 2026-09-15 залита разово бэкфиллом из Vercel API (см. docs/session-journal.md).
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  -- uid деплоя Vercel (dpl_...). NULL — если переменная окружения не
  -- доехала до скрипта; строка всё равно считается, дедупликация только
  -- там, где id известен.
  deployment_id text unique,
  -- Домен конкретного деплоя (redevelopment-<hash>.vercel.app) — ссылка на
  -- сборку в Vercel, полезна при разборе «что именно выехало».
  deployment_url text,
  commit_sha text,
  commit_message text,
  commit_ref text,
  commit_author text,
  -- READY — сборка дошла до конца (единственное, что пишет билд-скрипт).
  -- ERROR/CANCELED встречаются только в бэкфилле из Vercel API.
  state text not null default 'READY',
  -- 'build' — записал сам деплой, 'vercel-backfill' — разовая заливка истории.
  source text not null default 'build',
  deployed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists deployments_deployed_at_idx on public.deployments (deployed_at desc);

comment on table public.deployments is
  'Прод-деплои redevelopment.pro. Пишется последним шагом сборки (scripts/record-deployment.mjs), читается страницей метрик.';

alter table public.deployments enable row level security;

-- Читают сотрудники в админке (страница метрик), пишет только service-role
-- ключ из сборки — он RLS обходит, отдельной insert-политики не нужно.
drop policy if exists authenticated_select on public.deployments;
create policy authenticated_select on public.deployments
  for select to authenticated using (true);

notify pgrst, 'reload schema';
