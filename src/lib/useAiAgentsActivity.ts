import { useEffect, useState } from 'react';
import { fetchAiAgentsLastActivity, type AiAgentActivity } from './aiAgentsApi';

export interface AiAgentsActivityState {
  // Последняя выполненная задача каждого агента (ключ — AiAgent.id).
  activity: Record<string, AiAgentActivity>;
  // Момент, относительно которого считаются "5 мин назад" и статус. Тикает
  // раз в минуту вместе с опросом — без него подпись застывала бы: у агентов
  // без следа в базе (Claude Code, Codex — у них staticActivity-константа)
  // ответ RPC не меняется, перерисовывать карточку нечему, и "3 мин назад"
  // висело бы до перезагрузки страницы (владелец, 2026-09-17: "сделай, чтобы
  // карточки сами обновлялись раз в минуту").
  now: Date;
}

// Последняя выполненная задача каждого ИИ-агента с автообновлением раз в
// минуту. Раньше этот эффект жил прямо в Contractors.tsx, но карточка-пилюля
// ИИ-закупщика над вкладками «Закупок» (AiAgentStatusPill) хочет ровно то же
// самое — вынесено сюда, чтобы правило опроса было одно на оба места.
//
// Почему раз в минуту: агенты работают фоном, и без опроса статус застывал бы
// на «12 мин назад» до перезагрузки страницы. Ошибка опроса не трогает уже
// показанное — остаётся прошлый ответ (строка декоративная, ломать из-за неё
// страницу нельзя), но `now` при этом всё равно сдвигается: подпись времени
// обязана идти вперёд независимо от того, ответила ли база.
// На скрытой вкладке не опрашиваем, при возврате на неё обновляем сразу, не
// дожидаясь тика.
export function useAiAgentsActivity(): AiAgentsActivityState {
  const [activity, setActivity] = useState<Record<string, AiAgentActivity>>({});
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      setNow(new Date());
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

  return { activity, now };
}
