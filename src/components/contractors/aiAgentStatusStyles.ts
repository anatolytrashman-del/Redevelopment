import type { AiAgentStatusTone } from '../../lib/aiAgentsApi';

// Цвет кружка и подписи под каждый статус ИИ-агента. Онлайн пульсирует — это
// единственный статус, где что-то прямо сейчас происходит. Общее для большой
// карточки в «Команде» (AiAgentCard) и пилюли над вкладками «Закупок»
// (AiAgentStatusPill), чтобы зелёный/серый/красный не разъехались между ними.
export const aiAgentStatusStyles: Record<AiAgentStatusTone, { text: string; dot: string }> = {
  online: { text: 'text-success', dot: 'bg-emerald-500 animate-pulse' },
  idle: { text: 'text-ink-muted', dot: 'bg-ink-faint' },
  down: { text: 'text-danger', dot: 'bg-danger' },
};
