// Деплои redevelopment.pro — измеримый след работы ИИ-кодеров: прод-релизы
// считаются для Claude Code, а сборки стабильной ветки preview — для Codex.
//
// Строки создаёт последним шагом Vercel-сборки scripts/record-deployment.mjs
// (см. `npm run build`), история прода до 2026-09-15 залита бэкфиллом из Vercel
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
