import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, it, expect, afterEach } from 'vitest';

const script = join(process.cwd(), 'scripts/sync-catalog-root-shell.mjs');
const dirs = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function runSync(env) {
  const cwd = mkdtempSync(join(tmpdir(), 'sync-root-'));
  dirs.push(cwd);
  mkdirSync(join(cwd, 'dist', 'minsk', 'bc'), { recursive: true });
  mkdirSync(join(cwd, 'dist', 'minsk', 'tc'), { recursive: true });
  writeFileSync(join(cwd, 'dist', 'index.html'), '<html><body><div id="root"><h1>shell</h1></div></body></html>');
  writeFileSync(
    join(cwd, 'dist', 'minsk', 'bc', 'index.html'),
    '<html><body><div id="root"><div class="hub">BC hub</div></div></body></html>',
  );
  writeFileSync(
    join(cwd, 'dist', 'minsk', 'tc', 'index.html'),
    '<html><body><div id="root"><div class="hub">TC hub</div></div></body></html>',
  );
  const result = spawnSync(process.execPath, [script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { cwd, result };
}

describe('sync-catalog-root-shell', () => {
  it('copies bc hub into index.html for offices', () => {
    const { cwd, result } = runSync({ PUBLIC_SITE: 'offices', VITE_PUBLIC_SITE: 'offices' });
    expect(result.status).toBe(0);
    expect(readFileSync(join(cwd, 'dist', 'index.html'), 'utf8')).toContain('BC hub');
    expect(readFileSync(join(cwd, 'dist', 'index.html'), 'utf8')).not.toContain('<h1>shell</h1>');
  });

  it('copies tc hub into index.html for malls', () => {
    const { cwd, result } = runSync({ PUBLIC_SITE: 'malls', VITE_PUBLIC_SITE: 'malls' });
    expect(result.status).toBe(0);
    expect(readFileSync(join(cwd, 'dist', 'index.html'), 'utf8')).toContain('TC hub');
  });

  it('no-op on platform', () => {
    const { cwd, result } = runSync({ PUBLIC_SITE: 'platform', VITE_PUBLIC_SITE: 'platform' });
    expect(result.status).toBe(0);
    expect(readFileSync(join(cwd, 'dist', 'index.html'), 'utf8')).toContain('<h1>shell</h1>');
  });
});
