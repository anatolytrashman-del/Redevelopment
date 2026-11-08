import { describe, expect, it } from 'vitest';
import { checkDistHtml, judgeSummaries, summarizeReport } from './malllist-release-gate.mjs';

function report(overrides = {}) {
  return summarizeReport({
    finalUrl: 'https://malllist.pro/',
    fetchTime: '2026-11-08T09:25:21.643Z',
    lighthouseVersion: '13.6.0',
    categories: {
      performance: { score: 0.94 },
      accessibility: { score: 0.96 },
      'best-practices': { score: 0.96 },
      seo: { score: 1 },
    },
    audits: {
      'first-contentful-paint': { numericValue: 1100 },
      'largest-contentful-paint': { numericValue: 1800 },
      'speed-index': { numericValue: 1600 },
      'total-blocking-time': { numericValue: 40 },
      'cumulative-layout-shift': { numericValue: 0 },
      'errors-in-console': { details: { items: [] } },
    },
    ...overrides,
  });
}

describe('malllist release gate', () => {
  it('пропускает медиану трёх зелёных прогонов', () => {
    const result = judgeSummaries([report(), report(), report()]);
    expect(result.ok).toBe(true);
    expect(result.median.categories.performance).toBe(94);
  });

  it('падает, если медиана performance ниже 90', () => {
    const low = report({
      categories: {
        performance: { score: 0.83 },
        accessibility: { score: 0.96 },
        'best-practices': { score: 0.96 },
        seo: { score: 1 },
      },
    });
    const result = judgeSummaries([report(), low, low]);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('performance'))).toBe(true);
  });

  it('падает на React #418', () => {
    const broken = summarizeReport({
      categories: {
        performance: { score: 0.94 },
        accessibility: { score: 1 },
        'best-practices': { score: 1 },
        seo: { score: 1 },
      },
      audits: {
        'first-contentful-paint': { numericValue: 1000 },
        'largest-contentful-paint': { numericValue: 1200 },
        'speed-index': { numericValue: 1100 },
        'total-blocking-time': { numericValue: 10 },
        'cumulative-layout-shift': { numericValue: 0 },
        'errors-in-console': { details: { items: [{ description: 'Error: Minified React error #418' }] } },
      },
    });
    expect(judgeSummaries([broken]).reasons).toContain('React hydration error #418 в консоли');
  });

  it('ловит регрессию относительно baseline', () => {
    const result = judgeSummaries([report()], {
      baseline: { categories: { performance: 98, accessibility: 96, 'best-practices': 96, seo: 100 } },
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('регрессия'))).toBe(true);
  });

  it('не принимает пустой пререндер и потерю verification', () => {
    const html = `<!doctype html><html><head>
      <link rel="canonical" href="https://malllist.pro/">
      <script data-entry-loader=""></script>
      </head><body><main><p>Загружаем каталог…</p></main></body></html>`;
    const reasons = checkDistHtml(html, 'index.html');
    expect(reasons.some((r) => r.includes('h1'))).toBe(true);
    expect(reasons.some((r) => r.includes('Загружаем каталог'))).toBe(true);
    expect(reasons.some((r) => r.includes('5893ee662c25f112'))).toBe(true);
  });
});
