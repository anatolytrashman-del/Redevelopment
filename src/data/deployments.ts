// Прод-деплои redevelopment.pro — единственный измеримый след работы
// ИИ-кодера (Claude Code): в activity_log он не пишет, кнопок в админке не
// жмёт, он пишет код и публикует релизы.
//
// Строки создаёт последним шагом прод-сборки scripts/record-deployment.mjs
// (см. `npm run build`), история до 2026-09-15 залита бэкфиллом из Vercel
// API. Схема — supabase/migrations/20260915-deployments.sql.

// Состояние сборки на Vercel. Билд-скрипт пишет только READY (он выполняется
// в самом конце успешной сборки); ERROR/CANCELED встречаются в записях
// бэкфилла — упавшие и отменённые сборки.
export type DeploymentState = 'READY' | 'ERROR' | 'CANCELED';

export interface DeploymentRow {
  id: string;
  deployment_id: string | null;
  deployment_url: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  commit_ref: string | null;
  commit_author: string | null;
  state: string;
  source: string;
  deployed_at: string;
  created_at: string;
}
