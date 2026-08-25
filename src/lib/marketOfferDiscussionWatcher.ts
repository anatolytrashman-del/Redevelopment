import { useEffect } from 'react';
import { getCurrentProfile } from './accessProfile';
import { fetchFlaggedForDiscussionOffers } from './marketOffersApi';
import { addNotification } from './notifications';

// Фоновый опрос "не появилась ли новая карточка на обсуждение" (владелец:
// "если появляются новые карточки на утверждение, тоже выводить
// уведомление" — продолжение колокольчика, заведённого для расшифровки
// аудио). В отличие от того случая, здесь событие рождается в чужой
// вкладке — Светлана жмёт "Обсудить с Анатолием" на СВОЁМ устройстве, у
// владельца нет сокета/пуша, которым можно было бы получить это мгновенно.
// Поэтому вместо push — обычный поллинг Supabase с клиента, тот же принцип,
// что и у остального проекта (без бэкенд-инфраструктуры для realtime).
const POLL_INTERVAL_MS = 60_000;
const SEEN_KEY = 'redevelopment-seen-discussion-offer-ids';

function readSeenIds(): Set<number> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw == null) return null; // null = ни разу не опрашивали в этом браузере
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return null;
  }
}

function writeSeenIds(ids: number[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // тихо игнорируем — не критично, просто более многословный follow-up-опрос
  }
}

async function pollOnce(): Promise<void> {
  const offers = await fetchFlaggedForDiscussionOffers();
  const currentIds = offers.map((o) => o.id);
  const seen = readSeenIds();

  // Первый опрос в этом браузере (seen === null) — просто запоминаем
  // текущий набор как базовый, ничего не отправляем: карточки, отфлагованные
  // ДО того, как эта фича появилась, не новость для владельца.
  if (seen != null) {
    const fresh = offers.filter((o) => !seen.has(o.id));
    if (fresh.length === 1) {
      addNotification({
        title: 'Новая карточка на обсуждение',
        body: fresh[0].address || 'Объявление без адреса — см. вкладку «Обсуждение»',
      });
    } else if (fresh.length > 1) {
      addNotification({
        title: 'Новые карточки на обсуждение',
        body: `Светлана отметила ${fresh.length} объявлений — см. вкладку «Обсуждение» на странице «Аналитика рынка»`,
      });
    }
  }

  // Не объединяем с прежним seen, а заменяем целиком: карточка, которую
  // владелец уже разобрал ("Вернуть на доработку"), пропадает из
  // отфлагованных — если её отфлагуют повторно позже, это снова новость.
  writeSeenIds(currentIds);
}

// Один хук на всё приложение (вызывается из AppLayout — общего родителя всех
// /admin/* страниц), не с каждой страницы отдельно, иначе опрос запускался
// бы параллельно N раз. Только для владельца (isSuperAdmin) — иначе
// Светлана получала бы уведомление о собственном же действии.
export function useMarketOfferDiscussionWatcher(): void {
  useEffect(() => {
    if (!getCurrentProfile().isSuperAdmin) return;
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
