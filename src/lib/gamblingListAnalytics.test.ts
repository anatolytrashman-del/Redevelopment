import { describe, expect, it, vi } from 'vitest';

vi.mock('./authFetch', () => ({ authFetch: vi.fn() }));

import { fillDailyGaps, parseGamblingAnalytics } from './gamblingListAnalytics';

describe('parseGamblingAnalytics', () => {
  it('без токена — not-configured, а не ошибка', () => {
    expect(parseGamblingAnalytics(true, { configured: false })).toEqual({ status: 'not-configured' });
  });

  it('ошибка API пробрасывает текст', () => {
    expect(parseGamblingAnalytics(false, { configured: true, error: 'Vercel Web Analytics: HTTP 403' })).toEqual({
      status: 'error',
      message: 'Vercel Web Analytics: HTTP 403',
    });
    expect(parseGamblingAnalytics(false, null).status).toBe('error');
  });

  it('пустые ряды (скрипт ещё не стоит) — ok с пустыми массивами', () => {
    const parsed = parseGamblingAnalytics(true, { configured: true, since: '2026-10-01', until: '2026-10-26', daily: [] });
    expect(parsed).toMatchObject({ status: 'ok', daily: [], pages: [], referrers: [], countries: [] });
  });
});

describe('fillDailyGaps', () => {
  it('заполняет пропущенные дни нулями', () => {
    const filled = fillDailyGaps(
      [{ day: '2026-10-02', pageviews: 5, visitors: 3 }],
      '2026-10-01T00:00:00.000Z',
      '2026-10-03T12:00:00.000Z',
    );
    expect(filled).toEqual([
      { day: '2026-10-01', pageviews: 0, visitors: 0 },
      { day: '2026-10-02', pageviews: 5, visitors: 3 },
      { day: '2026-10-03', pageviews: 0, visitors: 0 },
    ]);
  });

  it('некорректный диапазон — возвращает как есть', () => {
    const daily = [{ day: '2026-10-02', pageviews: 1, visitors: 1 }];
    expect(fillDailyGaps(daily, '', '2026-10-03')).toBe(daily);
  });
});
