// Запись деплоя в таблицу deployments — источник метрики «релизов на
// прод» у Claude Code и «деплоев на превью» у Codex на /admin/metrics.
//
// Владелец, 2026-09-15: «можем вывести метрику по количеству деплоев на
// страницу метрики для ИИ-сотрудника Claude Code». У Claude Code нет следов
// в activity_log (он не жмёт кнопки в админке, а пишет код и публикует
// релизы), поэтому его единственное измеримое действие — деплой, и считать
// его больше неоткуда.
//
// Почему не спрашиваем Vercel API из серверной функции: (1) пришлось бы
// положить VERCEL_TOKEN (права на весь аккаунт) в env прода ради одной
// цифры, (2) Vercel хранит историю деплоев ограниченно — сейчас в ней ровно
// 30 дней, так что «за прошлый месяц» через год было бы пусто. Здесь же
// запись остаётся в нашей базе навсегда. История до 2026-09-15 залита
// разовым бэкфиллом из Vercel API (source = 'vercel-backfill').
//
// Запускается последним шагом `npm run build` — то есть уже после
// пререндера и OG-обложек, за секунды до того, как деплой станет READY.
// Пишем прод и единственную стабильную preview-ветку. Прочие preview-сборки
// сознательно не считаем работой Codex (vercel.json и так деплоит только две ветки).
//
// Сетевая ошибка НЕ валит сборку: потерять цифру в метрике — мелочь, уронить
// из-за неё прод-деплой — нет.
import { createClient } from '@supabase/supabase-js';
import { previewDeploymentBackfill } from './preview-deployment-backfill.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const environment = process.env.VERCEL_ENV;
  const commitRef = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const isProduction = environment === 'production';
  const isStablePreview = environment === 'preview' && commitRef === 'preview';
  if (!isProduction && !isStablePreview) {
    console.log(
      `[record-deployment] не целевая Vercel-сборка (VERCEL_ENV=${environment ?? 'нет'}, ref=${commitRef ?? 'нет'}) — пропускаем`,
    );
    return;
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[record-deployment] нет SUPABASE_SERVICE_ROLE_KEY — деплой не записан в метрику');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (isStablePreview) {
    const { error: backfillError } = await supabase
      .from('deployments')
      .upsert(previewDeploymentBackfill, { onConflict: 'deployment_id', ignoreDuplicates: true });
    if (backfillError) {
      console.warn('[record-deployment] не дозалили историю preview-деплоев:', backfillError.message);
    } else {
      console.log(`[record-deployment] проверен бэкфилл ${previewDeploymentBackfill.length} preview-деплоев`);
    }
  }

  const row = {
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    deployment_url: process.env.VERCEL_URL ?? null,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    // В сообщении мерж-коммита вторая строка — заголовок PR; в метрике нужна
    // одна строка, полный текст всегда есть в гите.
    commit_message: (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '').split('\n')[0].slice(0, 300) || null,
    commit_ref: commitRef,
    commit_author: process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN ?? null,
    state: 'READY',
    source: 'build',
    deployed_at: new Date().toISOString(),
  };

  // Повторный запуск той же сборки (retry Vercel) не должен задваивать
  // строку — дедупликация по uid деплоя. Если uid в окружении не оказалось,
  // пишем как есть: одна сборка = одна строка.
  const { error } = row.deployment_id
    ? await supabase.from('deployments').upsert(row, { onConflict: 'deployment_id', ignoreDuplicates: true })
    : await supabase.from('deployments').insert(row);
  if (error) {
    console.warn('[record-deployment] не записали деплой:', error.message);
    return;
  }
  console.log(
    `[record-deployment] записан ${isProduction ? 'прод' : 'preview'}-деплой ${row.deployment_id ?? row.deployment_url ?? 'без id'} (${row.commit_sha?.slice(0, 7) ?? 'без sha'})`,
  );
}

main().catch((err) => {
  console.warn('[record-deployment] не записали деплой:', err?.message ?? err);
});
