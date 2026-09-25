import { supabase } from './supabase';
import { addNotification } from './notifications';
import { EPOCH, readWatermark, useBackgroundPoll, writeWatermark } from './backgroundPoll';

// Фоновый опрос новых ответов поставщиков — тот же принцип, что и
// marketOfferDiscussionWatcher.ts (событие рождается на стороне
// поставщика/вебхука, не в этой вкладке — push/сокета нет, поэтому обычный
// поллинг Supabase с клиента). EMAIL_CORRESPONDENCE_PLAN.md, этап 2.
//
// В отличие от того вотчера — НЕ ограничен isSuperAdmin: переписку с
// поставщиками ведёт и Светлана, ей тоже нужно узнавать об ответах.
//
// С 2026-09-24 спрашивает только входящие позже отметки и только два поля:
// раньше каждую минуту шла вся переписка с телами писем (см. backgroundPoll.ts).
const WATERMARK_KEY = 'redevelopment-supplier-email-watermark';

interface IncomingEmailRow {
  from_address: string | null;
  created_at: string;
}

async function pollOnce(): Promise<void> {
  const watermark = readWatermark(WATERMARK_KEY);
  let query = supabase
    .from('supplier_offer_emails')
    .select('from_address,created_at')
    .eq('direction', 'in')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  // Первый опрос в этом браузере — только ставим отметку, без уведомлений:
  // письма, полученные ДО появления вотчера, не новость.
  query = watermark ? query.gt('created_at', watermark).limit(100) : query.limit(1);
  const { data, error } = await query;
  if (error) throw error;
  const fresh = (data ?? []) as IncomingEmailRow[];
  if (watermark) {
    if (fresh.length === 1) {
      addNotification({
        title: 'Ответ поставщика',
        body: fresh[0].from_address || 'Новое письмо — см. вкладку «Переписка» на странице «Закупки»',
      });
    } else if (fresh.length > 1) {
      addNotification({
        title: 'Ответы поставщиков',
        body: `${fresh.length} новых писем — см. вкладку «Переписка» на странице «Закупки»`,
      });
    }
  }
  // Писем ещё нет вовсе — отметка «с начала времён», иначе первое письмо
  // так и осталось бы «базовым набором» без уведомления.
  writeWatermark(WATERMARK_KEY, fresh[0]?.created_at ?? (watermark ? null : EPOCH));
}

// Один хук на всё приложение (вызывается из AppLayout), не с каждой
// страницы отдельно — иначе опрос запускался бы параллельно N раз.
export function useSupplierEmailWatcher(): void {
  useBackgroundPoll(pollOnce);
}
