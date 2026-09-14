import { Bot, Check, Clock } from 'lucide-react';
import { ClaudeLogo } from './ClaudeLogo';
import type { AiAgent } from '../../data/aiAgents';
import { formatActivityTime, type AiAgentActivity } from '../../lib/aiAgentsApi';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

// Карточка ИИ-агента в "Команде" — та же геометрия и стекло, что у
// ContractorCard, но без контактов: у агента их нет, вместо них статус
// "Онлайн" (агенты крутятся кроном/очередями круглосуточно, см.
// data/aiAgents.ts), последняя выполненная задача (владелец, 2026-09-14:
// "сделай время последней выполненной задачи агента" — из RPC
// ai_agents_last_activity, см. lib/aiAgentsApi.ts) и список задач.
// Не кликабельна — редактировать нечего.
export function AiAgentCard({ agent, activity: liveActivity }: { agent: AiAgent; activity?: AiAgentActivity | null }) {
  const activity = liveActivity ?? agent.staticActivity ?? null;
  return (
    <div className={cn('flex w-full flex-col gap-2 p-4', glassCardClass)} style={glassCardShadow}>
      <div className="flex min-w-0 items-center gap-2.5">
        {agent.icon === 'claude' ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d97757]/15 text-[#d97757]">
            <ClaudeLogo className="h-5 w-5" />
          </span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <div className="break-words font-semibold text-ink">{agent.name}</div>
          <div className="truncate text-sm text-ink-muted">{agent.role}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-success">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        Онлайн
      </div>
      {activity && (
        <div
          className="flex items-start gap-1.5 text-sm text-ink-muted"
          title={new Date(activity.doneAt).toLocaleString('ru-RU')}
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <span className="min-w-0">
            <span className="block truncate">{activity.label}</span>
            <span className="block text-xs text-ink-faint">Выполнено {formatActivityTime(activity.doneAt)}</span>
          </span>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {agent.tasks.map((task) => (
          <li key={task} className="flex items-start gap-1.5 text-sm text-ink-muted">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span>{task}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
