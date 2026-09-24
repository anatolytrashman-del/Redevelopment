-- История запусков pg_cron (cron.job_run_details) — самая большая таблица
-- базы (44 МБ из 156 на 2026-09-24): пять заданий раз в минуту дают ~7 000
-- строк в сутки, и никто их не чистил. У бесплатного тарифа Supabase лимит
-- базы — 500 МБ. Храним неделю.
select cron.unschedule('purge-cron-history') where exists (select 1 from cron.job where jobname = 'purge-cron-history');
select cron.schedule(
  'purge-cron-history',
  '23 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
