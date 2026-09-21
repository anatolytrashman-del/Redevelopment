# Трекер линкбилдинга

Рабочие таблицы для `LINKBUILDING_PLAN.md`. Формат и схема колонок — из
раздела «[LB-0.2] Завести трекер» плана.

- `baseline_backlinks.csv` — снимок входящих ссылок (LB-0.1). Источник —
  `public.site_backlinks` (Supabase), которую раз в сутки заполняет
  Edge Function `sync-yandex-webmaster` из Яндекс.Вебмастера. Столбцы
  ýже, чем в исходном плане: `анкор` и `dofollow/nofollow` в CSV не
  вошли — Яндекс.Вебмастер (`/links/external/samples`) их не отдаёт
  вовсе, отчёт Google Search Console «Links» не входит в официальный
  Search Console API (см. комментарий в
  `supabase/migrations/20260917-site-backlinks.sql`) — GSC как источник
  бэклинков поэтому не подключён и не имитируется. `provider` вместо
  этого фиксирует источник строки на будущее, когда донор появится
  второй.
  **Снимок на 21.09.2026: 0 строк.** Проверено напрямую в базе — cron
  `sync-yandex-webmaster` в этот день отработал штатно (`yandex_webmaster_stats`
  пополнилась), но `site_backlinks` пуст: Яндекс.Вебмастер пока не знает ни
  одной внешней ссылки на redevelopment.pro. Это и есть точка отсчёта —
  не баг синка, а честный факт «ссылочный профиль пока нулевой».
- `prospects.csv` — база доноров (справочники, БЦ, медиа, блогеры и т.д.).
- `outreach_log.csv` — журнал отправленных писем/сообщений по каждому
  `prospect_id`.
- `acquired_links.csv` — фактически полученные ссылки, с привязкой к
  фазе плана (`phase`, например `LB-2.2`).
- `templates/` — шаблоны писем по мере готовности (LB-1.3, LB-2.2, LB-4.2).

## Как обновлять

- Разослал письма волной — построчно добавить в `outreach_log.csv`,
  статус в `prospects.csv` перевести в `contacted`.
- Пришёл ответ (в любую сторону) — обновить `status`/`result` у
  соответствующего `prospect_id`, датой `last_touch`.
- Поставили ссылку — строка в `acquired_links.csv` + `status=won` в
  `prospects.csv`.
- Обновление `baseline_backlinks.csv` — не вручную: перегенерировать
  запросом к `public.site_backlinks` (Supabase Management API,
  `SUPABASE_ACCESS_TOKEN`, см. CLAUDE.md → «SQL-миграции») по мере
  того, как накапливаются реальные ссылки; частота — вместе с
  ежеквартальным аудитом профиля (см. «Метрики и ритм» в плане).
