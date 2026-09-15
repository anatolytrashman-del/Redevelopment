import { Bot } from 'lucide-react';
import { aiAgents } from '../../data/aiAgents';
import { formatActivityTime, getAiAgentStatus } from '../../lib/aiAgentsApi';
import { useAiAgentsActivity } from '../../lib/useAiAgentsActivity';
import { cn } from '../../lib/cn';
import { glassPillClass, glassPillShadow } from '../../lib/glass';
import { aiAgentStatusStyles } from './aiAgentStatusStyles';

// Компактная пилюля агента рядом с меню раздела (владелец, 2026-09-15:
// «справа от нашего меню выведем статус онлайна ИИ-закупщика и покажем его
// последнее действие, например, ответ на письмо или распознавание счёта»).
// Тот же расчёт статуса и та же RPC, что у большой карточки в «Команде»
// (AiAgentCard) — здесь просто одна строка: имя, статус и последняя задача.
// Данные тянет сама, раз в минуту (useAiAgentsActivity), поэтому вставлять
// её можно в любую шапку без подготовки на странице.
//
// Если агента с таким id нет в data/aiAgents.ts — не рисуем ничего: пусть
// лучше пропадёт декоративная строка, чем упадёт страница.
export function AiAgentStatusPill({ agentId, className }: { agentId: string; className?: string }) {
  const activityByAgent = useAiAgentsActivity();
  const agent = aiAgents.find((a) => a.id === agentId);
  if (!agent) return null;

  const activity = activityByAgent[agent.id] ?? agent.staticActivity ?? null;
  const status = getAiAgentStatus(agent.heartbeat, activity);
  const statusStyle = aiAgentStatusStyles[status.tone];

  return (
    // Ширина по содержимому, но не шире 320px: пилюля стоит вплотную к меню
    // раздела и не растягивается на полстроки, отталкивая кнопки справа.
    // Длинная подпись задачи обрезается многоточием, целиком она есть в title.
    <div
      className={cn('flex min-w-0 max-w-full items-center gap-2 px-3 py-1.5 sm:max-w-[320px]', glassPillClass, className)}
      style={glassPillShadow}
      title={status.hint}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-4 w-4" />
        {/* Кружок статуса — на аватаре, как индикатор присутствия в мессенджерах:
            в одну строку он читается быстрее, чем отдельной точкой перед текстом. */}
        <span
          className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white', statusStyle.dot)}
        />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">{agent.name}</span>
          <span className={cn('shrink-0 text-xs font-medium', statusStyle.text)}>{status.label}</span>
        </span>
        <span
          className="flex min-w-0 items-baseline gap-1 text-xs text-ink-faint"
          title={activity ? `${activity.label} — ${new Date(activity.doneAt).toLocaleString('ru-RU')}` : undefined}
        >
          {/* Обрезается только подпись задачи: "5 мин назад" — самое ценное в
              строке, поэтому время стоит отдельным shrink-0 и не режется. */}
          <span className="truncate">{activity ? activity.label : 'Задач пока не было'}</span>
          {activity && <span className="shrink-0">· {formatActivityTime(activity.doneAt)}</span>}
        </span>
      </span>
    </div>
  );
}
