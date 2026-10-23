import { describe, expect, it } from 'vitest';
import { validateStoragePathForClient, sanitizeFileName } from './_osnovaFiles.js';

describe('_osnovaFiles path validation (block 3)', () => {
  const cid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('accepts valid path under clients/<clientId>/', () => {
    expect(validateStoragePathForClient(`clients/${cid}/requests/req1/file.pdf`, cid)).toBe(true);
    expect(validateStoragePathForClient(`clients/${cid}/foo`, cid)).toBe(true);
  });

  it('rejects path traversal ..', () => {
    expect(validateStoragePathForClient(`clients/${cid}/../etc/passwd`, cid)).toBe(false);
    expect(validateStoragePathForClient(`clients/${cid}/requests/req1/..%2f..`, cid)).toBe(false);
  });

  it('rejects other client id', () => {
    const other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    expect(validateStoragePathForClient(`clients/${other}/requests/x/y`, cid)).toBe(false);
    expect(validateStoragePathForClient(`clients/${cid}/.. /x`, cid)).toBe(false);
  });

  it('rejects missing clients/<clientId>/ prefix', () => {
    expect(validateStoragePathForClient(`requests/xx/file`, cid)).toBe(false);
    expect(validateStoragePathForClient(`clients/xxx/file`, cid)).toBe(false);
    expect(validateStoragePathForClient('', cid)).toBe(false);
  });

  it('sanitizeFileName strips path and bad chars', () => {
    expect(sanitizeFileName('/path/to/.. /bad name!.pdf')).toBe('bad_name_.pdf');
    expect(sanitizeFileName('')).toBe('file.bin');
  });
});
