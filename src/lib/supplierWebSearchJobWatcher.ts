import { supabase } from './supabase';
import { addNotification } from './notifications';
import { EPOCH, readWatermark, useBackgroundPoll, writeWatermark } from './backgroundPoll';

// Фоновый опрос завершённых заданий веб-поиска поставщиков — тот же
// принцип, что и у supplierEmailWatcher.ts (событие рождается в фоновом
// GitHub Actions скрипте, не в этой вкладке — push/сокета нет, поэтому
// обычный поллинг Supabase с клиента). Владелец, 2026-09-11: "я формирую
// поиск, система ищет в фоне, я закрываю вкладку, когда найдёт — по
// аналогии с письмами появится уведомление... отправляй и в колокольчик,
// чтобы и я, и Альмира его видели" — НЕ ограничен isSuperAdmin, ровно как
// и у supplierEmailWatcher (веб-поиск поставщиков ведёт и Альмира).
// С 2026-09-24 спрашивает только задания, завершённые позже отметки, и
// только нужные уведомлению поля (см. backgroundPoll.ts).
const WATERMARK_KEY = 'redevelopment-supplier-search-job-watermark';

interface FinishedJobRow {
  status: string;
  error: string | null;
  completed_at: string;
  section_title: string;
  items_text: string;
  results: unknown[] | null;
}

function toJob(row: FinishedJobRow) {
  return {
    status: row.status,
    error: row.error ?? '',
    completedAt: row.completed_at,
    sectionTitle: row.section_title ?? '',
    itemsText: row.items_text ?? '',
    results: Array.isArray(row.results) ? row.results : [],
  };
}

function jobLabel(job: { sectionTitle: string; itemsText: string }): string {
  const base = job.sectionTitle || job.itemsText;
  return base.length > 60 ? `${base.slice(0, 60)}…` : base;
}

async function pollOnce(): Promise<void> {
  const watermark = readWatermark(WATERMARK_KEY);
  let query = supabase
    .from('supplier_web_search_jobs')
    .select('status,error,completed_at,section_title,items_text,results')
    .in('status', ['done', 'error'])
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });
  // Первый опрос в этом браузере — только ставим отметку, без уведомлений:
  // задания, завершённые ДО появления вотчера, не новость.
  query = watermark ? query.gt('completed_at', watermark).limit(100) : query.limit(1);
  const { data, error } = await query;
  if (error) throw error;
  const fresh = ((data ?? []) as FinishedJobRow[]).map(toJob);

  if (watermark) {
    const done = fresh.filter((j) => j.status === 'done');
    const failed = fresh.filter((j) => j.status === 'error');

    if (done.length === 1) {
      addNotification({
        title: 'Поиск поставщиков завершён',
        body: `«${jobLabel(done[0])}» — найдено ${done[0].results.length}. Смотрите вкладку «Поставщики» на странице «Закупки».`,
      });
    } else if (done.length > 1) {
      addNotification({
        title: 'Поиск поставщиков завершён',
        body: `${done.length} завершённых поиска — смотрите вкладку «Поставщики» на странице «Закупки».`,
      });
    }

    if (failed.length === 1) {
      addNotification({
        title: 'Поиск поставщиков не удался',
        body: `«${jobLabel(failed[0])}»: ${failed[0].error || 'см. вкладку «Поставщики»'}`,
      });
    } else if (failed.length > 1) {
      addNotification({
        title: 'Поиск поставщиков не удался',
        body: `${failed.length} заданий завершились ошибкой — смотрите вкладку «Поставщики» на странице «Закупки».`,
      });
    }
  }

  writeWatermark(WATERMARK_KEY, fresh[0]?.completedAt ?? (watermark ? null : EPOCH));
}

// Один хук на всё приложение (вызывается из AppLayout), не с каждой
// страницы отдельно — иначе опрос запускался бы параллельно N раз.
export function useSupplierWebSearchJobWatcher(): void {
  useBackgroundPoll(pollOnce);
}
