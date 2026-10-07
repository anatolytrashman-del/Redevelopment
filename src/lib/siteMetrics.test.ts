import { describe, expect, it } from 'vitest';
import type { MetrikaDailyStat } from '../data/metrikaStats';
import {
  chartAxisTicks, combineSearchDaily, mergeSiteDailyStats, metricsPeriodBounds,
  selectMetricsPeriod, siteMetricsToday, yandexLagNote,
} from './siteMetrics';

const yesterday: MetrikaDailyStat = {
  date: '2026-10-02', visits: 3, users: 2, pageviews: 15,
  bounceRate: 0, pageDepth: 5, avgDurationSeconds: 177,
};

describe('site metrics regression: own visits exist before Metrika reports today', () => {
  it('shows all of today’s paths without waiting for a Metrika row', () => {
    const merged = mergeSiteDailyStats([yesterday], [
      { day: '2026-10-03', path: '/', entries: 7, views: 9 },
      { day: '2026-10-03', path: '/minsk/bc', entries: 5, views: 8 },
    ]);
    expect(selectMetricsPeriod(merged, 'today', '2026-10-03')).toEqual([{
      date: '2026-10-03', visits: 12, users: 12, pageviews: 17,
      bounceRate: null, pageDepth: null, avgDurationSeconds: null,
    }]);
    expect(selectMetricsPeriod(merged, 'yesterday', '2026-10-03')).toEqual([yesterday]);
    expect(yesterday.visits).toBe(3);
  });

  it('works with own data alone and does not double-count overlapping sources', () => {
    const own = [{ day: '2026-10-02', path: '/', entries: 12, views: 10 }];
    expect(mergeSiteDailyStats([], own)[0]).toMatchObject({ visits: 12, users: 12, pageviews: 10 });
    expect(mergeSiteDailyStats([yesterday], own)[0]).toMatchObject({
      visits: 12, users: 12, pageviews: 15, bounceRate: 0, pageDepth: 5,
    });
    expect(mergeSiteDailyStats([], [])).toEqual([]);
  });

  it('never relabels an older row as today or yesterday', () => {
    const old = [{ date: '2026-09-30' }];
    expect(selectMetricsPeriod(old, 'today', '2026-10-03')).toEqual([]);
    expect(selectMetricsPeriod(old, 'yesterday', '2026-10-03')).toEqual([]);
  });

  it('counts calendar days with gaps, excludes future rows, and compares adjacent windows', () => {
    const rows = ['2026-09-19', '2026-09-20', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04'].map(date => ({ date }));
    expect(selectMetricsPeriod(rows, 7, '2026-10-03')).toEqual([{ date: '2026-09-27' }, { date: '2026-10-03' }]);
    expect(selectMetricsPeriod(rows, 7, '2026-10-03', true)).toEqual([{ date: '2026-09-20' }, { date: '2026-09-26' }]);
    expect(metricsPeriodBounds('yesterday', '2026-10-01', true)).toEqual({ start: '2026-09-29', end: '2026-09-29' });
    expect(metricsPeriodBounds(90, '2026-10-03', true)).toEqual({ start: '2026-04-07', end: '2026-07-05' });
  });

  it('draws search impressions from the first real day through today', () => {
    const days = combineSearchDaily(
      [
        { date: '2026-06-18', impressions: 0, clicks: 0 },
        { date: '2026-08-28', impressions: 1, clicks: 0 },
        { date: '2026-10-04', impressions: 101, clicks: 5 },
        { date: '2026-10-05', impressions: 0, clicks: 0 },
      ],
      [
        { date: '2026-08-26', impressions: 1, clicks: 0 },
        { date: '2026-10-04', impressions: 251, clicks: 5 },
        { date: '2026-10-05', impressions: 497, clicks: 3 },
      ],
      '2026-10-06',
    );
    expect(days[0]).toMatchObject({ date: '2026-08-26', impressions: 1, clicks: 0 });
    expect(days.find((day) => day.date === '2026-08-27')).toMatchObject({ impressions: 0, clicks: 0 });
    expect(days.find((day) => day.date === '2026-10-04')).toMatchObject({ impressions: 352, clicks: 10 });
    expect(days.at(-1)).toMatchObject({ date: '2026-10-06', impressions: 0, clicks: 0 });
    expect(days).toHaveLength(42);
    expect(yandexLagNote(days)).toBe('С 05.10 Яндекс ещё не отдал день. Ненулевые столбцы справа — пока только Google.');
  });

  it('does not warn about Yandex lag once Yandex has published the last day', () => {
    const days = combineSearchDaily(
      [{ date: '2026-10-01', impressions: 2, clicks: 1 }],
      [{ date: '2026-10-01', impressions: 3, clicks: 0 }],
      '2026-10-01',
    );
    expect(yandexLagNote(days)).toBeNull();
    expect(chartAxisTicks(19)).toEqual([0, 10, 20]);
    expect(chartAxisTicks(0)).toEqual([0, 1]);
  });

  it('rolls over at midnight in Minsk even when UTC and the browser date differ', () => {
    expect(siteMetricsToday(new Date('2026-10-02T20:59:59Z'))).toBe('2026-10-02');
    expect(siteMetricsToday(new Date('2026-10-02T21:00:00Z'))).toBe('2026-10-03');
    expect(metricsPeriodBounds('yesterday', '2027-01-01')).toEqual({ start: '2026-12-31', end: '2026-12-31' });
  });
});
