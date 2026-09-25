import { supabase } from './supabase';
import { addNotification } from './notifications';
import { EPOCH, readWatermark, useBackgroundPoll, writeWatermark } from './backgroundPoll';

// Фоновый опрос завершённых заданий обогащения контактов поставщиков — тот
// же принцип, что и у supplierWebSearchJobWatcher.ts (событие рождается в
// фоновом GitHub Actions скрипте, не в открытой вкладке). НЕ ограничен
// isSuperAdmin — конвейером поставщиков пользуется и Альмира.
//
// Владелец, 2026-09-11: обогащение запускается само, сразу после того как
// поиск добавил найденных поставщиков в базу — поэтому уведомление здесь не
// про "задание выполнено", а про то, что реально важно человеку: поставщик
// дособран и ГОТОВ К ВЕРИФИКАЦИИ (см. supplierVerificationStatus).
// С 2026-09-24 спрашивает только задания, завершённые позже отметки, и
// только нужные уведомлению поля (см. backgroundPoll.ts).
const WATERMARK_KEY = 'redevelopment-supplier-enrichment-job-watermark';

interface FinishedJobRow {
  status: string;
  error: string | null;
  completed_at: string;
}

function toJob(row: FinishedJobRow) {
  return { status: row.status, error: row.error ?? '', completedAt: row.completed_at };
}

async function pollOnce(): Promise<void> {
  const watermark = readWatermark(WATERMARK_KEY);
  let query = supabase
    .from('supplier_enrichment_jobs')
    .select('status,error,completed_at')
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
        title: 'Поставщик готов к верификации',
        body: 'Контакты собраны с сайта — проверьте карточку на странице «Закупки».',
      });
    } else if (done.length > 1) {
      addNotification({
        title: 'Поставщики готовы к верификации',
        body: `У ${done.length} поставщиков собраны контакты — проверьте их на странице «Закупки».`,
      });
    }

    if (failed.length === 1) {
      addNotification({
        title: 'Не удалось собрать контакты поставщика',
        body: failed[0].error || 'см. вкладку «Поставщики»',
      });
    } else if (failed.length > 1) {
      addNotification({
        title: 'Часть контактов собрать не удалось',
        body: `${failed.length} поставщиков остались без автоматически собранных контактов — проверьте их вручную.`,
      });
    }
  }

  writeWatermark(WATERMARK_KEY, fresh[0]?.completedAt ?? (watermark ? null : EPOCH));
}

// Один хук на всё приложение (вызывается из AppLayout), не с каждой
// страницы отдельно.
export function useSupplierEnrichmentJobWatcher(): void {
  useBackgroundPoll(pollOnce);
}
