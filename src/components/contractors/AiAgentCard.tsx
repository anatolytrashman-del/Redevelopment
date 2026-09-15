import { Bot, Check, Clock } from 'lucide-react';
import { ClaudeLogo } from './ClaudeLogo';
import type { AiAgent } from '../../data/aiAgents';
import { formatActivityTime, getAiAgentStatus, type AiAgentActivity } from '../../lib/aiAgentsApi';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
// Цвета статуса общие с пилюлей над вкладками «Закупок» (AiAgentStatusPill).
import { aiAgentStatusStyles } from './aiAgentStatusStyles';

// Карточка ИИ-агента в "Команде" — та же геометрия и стекло, что у
// ContractorCard, но без контактов: у агента их нет, вместо них статус,
// последняя выполненная задача (владелец, 2026-09-14: "сделай время последней
// выполненной задачи агента" — из RPC ai_agents_last_activity, см.
// lib/aiAgentsApi.ts) и список задач. Не кликабельна — редактировать нечего.
//
// Статус считается, а не рисуется константой (владелец, 2026-09-14: "сделай
// отсчёт онлайна от реальной функции, которая заявлена для агента"): берём
// время последней задачи этого агента и сверяем с heartbeat из
// data/aiAgents.ts — как часто заявленная функция обязана срабатывать.
// Страница перечитывает активность раз в минуту (см. Contractors.tsx),
// поэтому статус протухает сам, без перезагрузки.
export function AiAgentCard({ agent, activity: liveActivity }: { agent: AiAgent; activity?: AiAgentActivity | null }) {
  const activity = liveActivity ?? agent.staticActivity ?? null;
  const status = getAiAgentStatus(agent.heartbeat, activity);
  const statusStyle = aiAgentStatusStyles[status.tone];
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="break-words font-semibold text-ink">{agent.name}</span>
            {agent.tag && (
              <Badge tone="primary" className="px-2 py-0.5">
                {agent.tag}
              </Badge>
            )}
          </div>
          <div className="truncate text-sm text-ink-muted">{agent.role}</div>
        </div>
      </div>
      <div className={cn('flex items-center gap-1.5 text-sm font-medium', statusStyle.text)} title={status.hint}>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', statusStyle.dot)} />
        {status.label}
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
