import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseCSV,
  parseMapping,
  normalizeRequestRow,
  isAmbiguousForMatreshka,
} from './lib.mjs';

const FIXTURE = path.resolve('scripts/osnova/import/fixtures/sample-requests.csv');

describe('import lib (parse + mapping + ambiguity)', () => {
  it('parseCSV handles quotes and commas inside fields', () => {
    const csv = 'a,b\n"val,ue","with""quote"\n1,2';
    const rows = parseCSV(csv);
    expect(rows.length).toBe(2);
    expect(rows[0].a).toBe('val,ue');
    expect(rows[0].b).toBe('with"quote');
  });

  it('normalizeRequestRow + mapping maps russian headers to canonical', () => {
    const raw = { 'Дата': '2026-09-15', 'Поставщик': 'Фасад', 'Сумма': '125000,50', 'Юрлицо': 'Матрёшка' };
    const m = { 'Дата': 'date', 'Поставщик': 'supplier', 'Сумма': 'amount', 'Юрлицо': 'legalEntity' };
    const n = normalizeRequestRow(raw, m);
    expect(n.date).toBe('2026-09-15');
    expect(n.supplier).toBe('Фасад');
    expect(n.amount).toBe(125000.5);
    expect(n.legalEntity).toBe('Матрёшка');
  });

  it('isAmbiguousForMatreshka detects non-matreshka legal entities', () => {
    const m = { 'Юрлицо': 'legalEntity' };
    expect(isAmbiguousForMatreshka({ 'Юрлицо': 'Матрёшка' }, m)).toBe(false);
    expect(isAmbiguousForMatreshka({ 'Юрлицо': 'ИП Трэшмен' }, m)).toBe(true);
    expect(isAmbiguousForMatreshka({ 'Юрлицо': 'Лавэ Драйв' }, m)).toBe(true);
    expect(isAmbiguousForMatreshka({ 'Юрлицо': 'ООО Фасад' }, m)).toBe(false); // default to include unless known ambiguous
  });

  it('fixture loads and has expected ambiguous rows', () => {
    const text = fs.readFileSync(FIXTURE, 'utf8');
    const rows = parseCSV(text);
    const mapped = rows.map((r) => normalizeRequestRow(r, { 'Юрлицо': 'legalEntity', 'Сумма': 'amount' }));
    const amb = mapped.filter((r) => isAmbiguousForMatreshka(r.raw, { 'Юрлицо': 'legalEntity' }));
    expect(amb.length).toBeGreaterThanOrEqual(2);
    expect(amb.some((a) => /трэшмен/i.test(a.legalEntity))).toBe(true);
  });
});

describe('CLI refuse without --confirm (no secret read, no network)', () => {
  const script = path.resolve('scripts/osnova/import/import-requests-csv.mjs');

  it('refuses --apply without --confirm (exit !=0, no SUPABASE access attempted)', () => {
    // ensure we pass a file that exists, but no confirm
    const res = spawnSync(process.execPath, [
      script,
      '--file', FIXTURE,
      '--client', 'matreshka',
      '--mapping', '{"Дата":"date"}',
      '--apply',
    ], {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_URL: 'https://should-not-be-read.example', SUPABASE_SERVICE_ROLE_KEY: 'should-not-be-read' },
    });
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).toMatch(/requires --confirm|Refusing/i);
    // ensure we didn't leak key into output
    expect((res.stdout + res.stderr).includes('should-not-be-read')).toBe(false);
  });

  it('dry-run works without any SUPABASE_ env and without network', () => {
    const res = spawnSync(process.execPath, [
      script,
      '--file', FIXTURE,
      '--client', 'matreshka',
      '--mapping', '{"Дата":"date","Юрлицо":"legalEntity"}',
    ], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH }, // no SUPABASE at all
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/dry-run complete|dry-run/i);
    expect(res.stdout).toMatch(/excluded \(ambiguous/i);
  });
});
