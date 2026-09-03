import { useEffect } from 'react';
import { fetchAllSupplierOfferEmails } from './supplierOfferEmailsApi';
import { addNotification } from './notifications';

// Фоновый опрос новых ответов поставщиков — тот же принцип, что и
// marketOfferDiscussionWatcher.ts (событие рождается на стороне
// поставщика/вебхука, не в этой вкладке — push/сокета нет, поэтому обычный
// поллинг Supabase с клиента). EMAIL_CORRESPONDENCE_PLAN.md, этап 2.
//
// В отличие от того вотчера — НЕ ограничен isSuperAdmin: переписку с
// поставщиками ведёт и Светлана, ей тоже нужно узнавать об ответах.
const POLL_INTERVAL_MS = 60_000;
const SEEN_KEY = 'redevelopment-seen-supplier-email-ids';

function readSeenIds(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw == null) return null; // null = ни разу не опрашивали в этом браузере
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return null;
  }
}

function writeSeenIds(ids: string[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // тихо игнорируем — не критично, просто более многословный follow-up-опрос
  }
}

async function pollOnce(): Promise<void> {
  const emails = await fetchAllSupplierOfferEmails();
  const incoming = emails.filter((e) => e.direction === 'in');
  const currentIds = incoming.map((e) => e.id);
  const seen = readSeenIds();

  // Первый опрос в этом браузере — только фиксируем базовый набор, без
  // уведомлений: письма, полученные ДО появления вотчера, не новость.
  if (seen != null) {
    const fresh = incoming.filter((e) => !seen.has(e.id));
    if (fresh.length === 1) {
      addNotification({
        title: 'Ответ поставщика',
        body: fresh[0].fromAddress || 'Новое письмо — см. вкладку «Переписка» на странице «Закупки»',
      });
    } else if (fresh.length > 1) {
      addNotification({
        title: 'Ответы поставщиков',
        body: `${fresh.length} новых писем — см. вкладку «Переписка» на странице «Закупки»`,
      });
    }
  }

  // Не объединяем с прежним seen, а заменяем целиком — тот же принцип, что
  // и у discussion-вотчера (если письмо когда-нибудь исчезнет из выборки,
  // повторное появление снова будет новостью, не потеряется молча).
  writeSeenIds(currentIds);
}

// Один хук на всё приложение (вызывается из AppLayout), не с каждой
// страницы отдельно — иначе опрос запускался бы параллельно N раз.
export function useSupplierEmailWatcher(): void {
  useEffect(() => {
    pollOnce().catch(() => {
      // Фоновый опрос — молчаливая неудача не должна мешать работе в CRM,
      // следующий тик просто попробует ещё раз.
    });
    const timer = window.setInterval(() => {
      pollOnce().catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
}
