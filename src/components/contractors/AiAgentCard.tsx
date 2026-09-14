import { Bot, Check } from 'lucide-react';
import type { AiAgent } from '../../data/aiAgents';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

// Карточка ИИ-агента в "Команде" — та же геометрия и стекло, что у
// ContractorCard, но без контактов: у агента их нет, вместо них статус
// "Онлайн" (агенты крутятся кроном/очередями круглосуточно, см.
// data/aiAgents.ts) и список задач. Не кликабельна — редактировать нечего.
export function AiAgentCard({ agent }: { agent: AiAgent }) {
  return (
    <div className={cn('flex w-full flex-col gap-2 p-4', glassCardClass)} style={glassCardShadow}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="break-words font-semibold text-ink">{agent.name}</div>
          <div className="truncate text-sm text-ink-muted">{agent.role}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-success">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        Онлайн
      </div>
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
