import { describe, expect, it } from 'vitest';
import {
  getAiAgentStatus,
  materializeStaticActivity,
  resolveAiAgentActivity,
} from './aiAgentsApi';

describe('resolveAiAgentActivity', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('поднимает static daysAgo над устаревшим RPC', () => {
    const live = { label: 'Отправил письмо', doneAt: '2026-08-01T10:00:00Z' };
    const resolved = resolveAiAgentActivity(live, { label: 'Отправил письмо', daysAgo: 2 }, now);
    expect(resolved?.label).toBe('Отправил письмо');
    expect(resolved && resolved.doneAt > live.doneAt).toBe(true);
  });

  it('оставляет свежий RPC поверх пола', () => {
    const live = { label: 'Распознал счёт', doneAt: '2026-10-09T09:00:00Z' };
    const resolved = resolveAiAgentActivity(live, { label: 'Отправил письмо', daysAgo: 2 }, now);
    expect(resolved).toEqual(live);
  });
});

describe('getAiAgentStatus always-online', () => {
  it('онлайн при staleAfterMinutes null даже без следа', () => {
    const status = getAiAgentStatus(
      { staleAfterMinutes: null, scheduled: false, cadence: 'по мере поступления задач' },
      null,
    );
    expect(status.tone).toBe('online');
    expect(status.label).toBe('Онлайн');
  });
});

describe('materializeStaticActivity', () => {
  it('ставит doneAt на daysAgo дней назад', () => {
    const now = new Date('2026-10-09T15:00:00+03:00');
    const act = materializeStaticActivity({ label: 'Отправил письмо', daysAgo: 2 }, now);
    expect(act?.label).toBe('Отправил письмо');
    const d = new Date(act!.doneAt);
    expect(d.getDate()).toBe(7);
  });
});
