import { authFetch } from './authFetch';

// Что именно поменялось в данных — см. api/_rebuildScope.js и
// supabase/migrations/20260912-deploy-debounce-scope.sql. По этому значению
// scripts/prerender.mjs на следующей сборке решает, рендерить ли заново все
// ~286 публичных страниц (~6 минут) или только зависимые: от объектов зависят
// лишь их лендинги (/minsk/<slug>), остальное копируется с прода (~1 минута).
export type PublicRebuildScope = 'objects' | 'business_centers';

// Пререндеренный при сборке HTML публичных страниц (scripts/prerender.mjs,
// SEO_PLAN.md Э2-1) хранит title/meta/цены на момент последней сборки — без
// этой отметки они протухали бы до следующего обычного пуша. Best-effort, не
// блокирует сохранение в админке: ошибку просто глотаем.
//
// Сборку этот вызов НЕ запускает (2026-09-19): он лишь отмечает в
// deploy_debounce, что данные изменились, а сама пересборка идёт раз в час
// по pg_cron (см. api/trigger-rebuild.js и миграцию
// 20260919-rebuild-hourly-cron.sql). Правка не теряется, но на публичных
// страницах появляется в пределах часа, а не сразу.
export function triggerPublicRebuild(scope: PublicRebuildScope): void {
  authFetch('/api/trigger-rebuild', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  }).catch(() => {});
}
