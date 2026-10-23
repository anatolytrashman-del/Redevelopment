import { describe, expect, it } from 'vitest';
import { computeBlockDecision, shouldBlock } from './_osnovaRateLimit.js';

const MS = (m) => Date.now() - m * 60 * 1000;

describe('_osnovaRateLimit pure decisions', () => {
  it('0 attempts — no block', () => {
    const d = computeBlockDecision(0, new Date().toISOString(), 5);
    expect(d.blocked).toBe(false);
  });

  it('email 5 within window → block', () => {
    const first = new Date(MS(10)).toISOString();
    const d = computeBlockDecision(5, first, 5);
    expect(d.blocked).toBe(true);
  });

  it('ip 20 within window → block', () => {
    const first = new Date(MS(5)).toISOString();
    const d = computeBlockDecision(20, first, 20);
    expect(d.blocked).toBe(true);
  });

  it('after window — no block even high count', () => {
    const first = new Date(MS(20)).toISOString();
    const d = computeBlockDecision(99, first, 5);
    expect(d.blocked).toBe(false);
  });

  it('shouldBlock helper matches (email default)', () => {
    expect(shouldBlock(4, new Date(MS(1)).toISOString())).toBe(false);
    expect(shouldBlock(5, new Date(MS(1)).toISOString())).toBe(true);
  });

  it('ip limit 20 vs email 5 in compute', () => {
    const first = new Date(MS(1)).toISOString();
    expect(computeBlockDecision(19, first, 20).blocked).toBe(false);
    expect(computeBlockDecision(20, first, 20).blocked).toBe(true);
    expect(computeBlockDecision(4, first, 5).blocked).toBe(false);
    expect(computeBlockDecision(5, first, 5).blocked).toBe(true);
  });
});
