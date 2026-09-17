import type { AiAgentHeartbeat } from '../data/aiAgents';
import { supabase } from './supabase';
import { withRetry } from './withRetry';

export interface AiAgentActivity {
  // Подпись задачи ("Ответ на письмо поставщика", "Статистика спроса: Realt").
  label: string;
  // ISO-время завершения.
  doneAt: string;
}

interface ActivityRow {
  agent_id: string;
  label: string;
  done_at: string;
}

// Последняя выполненная задача каждого ИИ-агента — одним RPC
// (ai_agents_last_activity, SECURITY DEFINER, см. supabase/migrations/
// 20260914-ai-agents-last-activity.sql): агент оставляет след в нескольких
// таблицах с разными RLS, собирать это на фронте с anon-ключом нельзя.
// Ключ результата — AiAgent.id из data/aiAgents.ts; агента без следов в
// ответе просто нет.
export function fetchAiAgentsLastActivity(): Promise<Record<string, AiAgentActivity>> {
  return withRetry(async () => {
    const { data, error } = await supabase.rpc('ai_agents_last_activity');
    if (error) throw error;
    const result: Record<string, AiAgentActivity> = {};
    ((data ?? []) as ActivityRow[]).forEach((row) => {
      result[row.agent_id] = { label: row.label, doneAt: row.done_at };
    });
    return result;
  });
}

// "только что" / "5 мин назад" / "3 ч назад" / "вчера, 14:32" / "12.09, 08:23"
// — коротко, под карточку. Точное время всегда есть в title у элемента.
export function formatActivityTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24 && d.getDate() === now.getDate()) return `${diffHours} ч назад`;
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `вчера, ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}, ${time}`;
}

// Статус агента для карточки в «Команде» (владелец, 2026-09-14: «сделай
// отсчёт онлайна от реальной функции, которая заявлена для агента»).
// Считается от времени последней выполненной задачи и от heartbeat агента
// (см. data/aiAgents.ts) — раньше «Онлайн» было нарисовано константой и
// горело бы даже у вставшего крона.
//  online — функция отработала внутри своего срока;
//  idle   — событийный агент давно без работы (это не поломка);
//  down   — функция по расписанию молчит дольше срока, чинить.
// Отдельный случай — heartbeat.staleAfterMinutes === null: внешний сервис,
// который отвечает по запросу (ChatGPT/Codex). У него молчание вообще ничего
// не значит, он онлайн всегда, а последняя задача идёт в подсказку справкой.
export type AiAgentStatusTone = 'online' | 'idle' | 'down';

export interface AiAgentStatus {
  tone: AiAgentStatusTone;
  label: string;
  // Расшифровка в title: почему статус именно такой.
  hint: string;
}

export function getAiAgentStatus(
  heartbeat: AiAgentHeartbeat,
  activity: AiAgentActivity | null | undefined,
  now: Date = new Date(),
): AiAgentStatus {
  const iso = activity?.doneAt ?? '';
  const doneAt = new Date(iso);
  // Сервис по запросу: статус не зависит ни от следа в базе, ни от его
  // давности. «Ожидает задач» здесь было прямой неправдой — карточка писала
  // это в тот момент, когда Codex работал над задачей (владелец, 2026-09-17).
  if (heartbeat.staleAfterMinutes === null) {
    const ago = iso && !Number.isNaN(doneAt.getTime()) ? formatActivityTime(iso, now) : '';
    return {
      tone: 'online',
      label: 'Онлайн',
      hint: ago
        ? `Доступен всегда, работает ${heartbeat.cadence}. Последняя задача ${ago}`
        : `Доступен всегда, работает ${heartbeat.cadence}`,
    };
  }
  // Нет следа вообще: у крона это «не запускался ни разу», у событийного —
  // «ещё не было задач». Для scheduled это поломка, для остальных — простой.
  if (!iso || Number.isNaN(doneAt.getTime())) {
    return heartbeat.scheduled
      ? { tone: 'down', label: 'Нет связи', hint: `Ни одной выполненной задачи (ожидается ${heartbeat.cadence})` }
      : { tone: 'idle', label: 'Ожидает задач', hint: `Задач пока не было (работает ${heartbeat.cadence})` };
  }
  const ageMinutes = (now.getTime() - doneAt.getTime()) / 60000;
  const ago = formatActivityTime(iso, now);
  if (ageMinutes <= heartbeat.staleAfterMinutes) {
    return { tone: 'online', label: 'Онлайн', hint: `Последняя задача ${ago}, работает ${heartbeat.cadence}` };
  }
  return heartbeat.scheduled
    ? { tone: 'down', label: 'Нет связи', hint: `Последняя задача ${ago}, а должен работать ${heartbeat.cadence}` }
    : { tone: 'idle', label: 'Ожидает задач', hint: `Последняя задача ${ago}, работает ${heartbeat.cadence}` };
}
