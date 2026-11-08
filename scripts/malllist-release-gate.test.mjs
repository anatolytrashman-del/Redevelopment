import { describe, expect, it } from 'vitest';
import { checkDistDir, checkDistHtml, judgeSummaries, readBaselineCategories, summarizeReport } from './malllist-release-gate.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      'errors-in-console': { score: 1, details: { items: [] } },
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
    expect(judgeSummaries([broken]).reasons.join('\n')).toMatch(/#418/);
  });

  it('ловит #423 так же, как #418', () => {
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
        'errors-in-console': { details: { items: [{ description: 'Minified React error #423' }] } },
      },
    });
    expect(judgeSummaries([broken]).ok).toBe(false);
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

  it('не требует коды malllist у страницы другого сайта', () => {
    const html = `<!doctype html><html><head>
      <link rel="canonical" href="https://redevelopment.pro/minsk">
      <script data-entry-loader=""></script>
      </head><body><main><h1>Платформа</h1><a href="https://malllist.pro/">malllist</a></main></body></html>`;
    const reasons = checkDistHtml(html, 'index.html');
    expect(reasons.some((r) => r.includes('yandex-verification'))).toBe(false);
  });

  it('медиана терпит один плохой прогон, но не дырявый и не #418', () => {
    const low = report({
      categories: {
        performance: { score: 0.7 },
        accessibility: { score: 1 },
        'best-practices': { score: 1 },
        seo: { score: 1 },
      },
    });
    expect(judgeSummaries([low, report(), report()]).ok).toBe(true);
    const slow = report({
      audits: {
        'first-contentful-paint': { numericValue: 1100 },
        'largest-contentful-paint': { numericValue: 9000 },
        'speed-index': { numericValue: 1600 },
        'total-blocking-time': { numericValue: 40 },
        'cumulative-layout-shift': { numericValue: 0 },
        'errors-in-console': { score: 1, details: { items: [] } },
      },
    });
    expect(judgeSummaries([slow, report(), report()]).ok).toBe(true);
    expect(judgeSummaries([slow, slow, report()]).ok).toBe(false);
    const broken = report({
      audits: {
        'first-contentful-paint': { numericValue: 1100 },
        'largest-contentful-paint': { numericValue: 1800 },
        'speed-index': { numericValue: 1600 },
        'total-blocking-time': { numericValue: 40 },
        'cumulative-layout-shift': { numericValue: 0 },
        'errors-in-console': { score: 0, details: { items: [{ description: 'Hydration failed' }] } },
      },
    });
    expect(judgeSummaries([broken, report(), report()]).ok).toBe(false);
  });

  it('не считает отсутствующий аудит и NaN чистыми', () => {
    const missing = summarizeReport({
      requestedUrl: 'http://127.0.0.1/',
      finalUrl: 'http://127.0.0.1/',
      categories: { performance: { score: 0.95 }, accessibility: { score: 1 }, 'best-practices': { score: 1 }, seo: { score: 1 } },
      audits: {
        'first-contentful-paint': { numericValue: 1000 },
        'largest-contentful-paint': { numericValue: 1200 },
        'speed-index': { numericValue: 1100 },
        'total-blocking-time': { numericValue: 10 },
        'cumulative-layout-shift': { numericValue: Number.NaN },
      },
    });
    expect(judgeSummaries([missing]).ok).toBe(false);
    expect(summarizeReport({ runtimeError: { code: 'X' } }).invalid.join(' ')).toMatch(/runtimeError/);
  });

  it('порог метрики включительный, baseline из своего summary не молчит', () => {
    const edge = report({
      audits: {
        'first-contentful-paint': { numericValue: 2000 },
        'largest-contentful-paint': { numericValue: 3000 },
        'speed-index': { numericValue: 3800 },
        'total-blocking-time': { numericValue: 200 },
        'cumulative-layout-shift': { numericValue: 0.1 },
        'errors-in-console': { score: 1, details: { items: [] } },
      },
    });
    expect(judgeSummaries([edge]).ok).toBe(true);
    const summary = { pages: [{ url: 'https://malllist.pro/', median: { categories: { performance: 96, accessibility: 100, 'best-practices': 100, seo: 100 } } }] };
    expect(readBaselineCategories(summary, 'https://malllist.pro/').categories.performance).toBe(96);
    expect(readBaselineCategories(summary, 'https://malllist.pro/minsk/tc').error).toBeTruthy();
    expect(judgeSummaries([report()], { baseline: { note: 'чужой' } }).ok).toBe(false);
  });

  it('h1 только в комментарии не считается, нет карточки — провал', () => {
    const html = `<!doctype html><html><head>
      <!-- <h1>комментарий</h1> <link rel="canonical" href="https://malllist.pro/"> -->
      <link rel="canonical" href="https://malllist.pro/">
      <script data-entry-loader=""></script>
      </head><body><main><p>Загружаем каталог…</p></main></body></html>`;
    const reasons = checkDistHtml(html, 'index.html');
    expect(reasons.some((r) => r.includes('h1'))).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    expect(checkDistDir(dir).some((r) => r.includes('4-sezona-bedy'))).toBe(true);
  });
});
