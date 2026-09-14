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
