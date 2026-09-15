import { useEffect, useState } from 'react';
import { fetchAiAgentsLastActivity, type AiAgentActivity } from './aiAgentsApi';

// Последняя выполненная задача каждого ИИ-агента с автообновлением раз в
// минуту. Раньше этот эффект жил прямо в Contractors.tsx, но карточка-пилюля
// ИИ-закупщика над вкладками «Закупок» (AiAgentStatusPill) хочет ровно то же
// самое — вынесено сюда, чтобы правило опроса было одно на оба места.
//
// Почему раз в минуту: агенты работают фоном, и без опроса статус застывал бы
// на «12 мин назад» до перезагрузки страницы. Ошибка опроса не трогает уже
// показанное — остаётся прошлый ответ (строка декоративная, ломать из-за неё
// страницу нельзя). На скрытой вкладке не опрашиваем, при возврате на неё
// обновляем сразу, не дожидаясь тика.
export function useAiAgentsActivity(): Record<string, AiAgentActivity> {
  const [activity, setActivity] = useState<Record<string, AiAgentActivity>>({});

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      fetchAiAgentsLastActivity()
        .then((next) => {
          if (!cancelled) setActivity(next);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  return activity;
}
