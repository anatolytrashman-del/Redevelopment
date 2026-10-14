import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  applyVaDisableQuery,
  installVercelAnalyticsOptOut,
  isVercelAnalyticsDisabled,
  vercelAnalyticsBeforeSend,
  type VaStorage,
  type VaWindow,
} from './vercelAnalytics';

// Vite переписывает тела функций, и Function#toString в тесте уже не равен
// исходнику. Сверяем index.html с тем, что отдаёт node без бандлера — это
// и есть текст, который попадает в страницу.
//
// --experimental-strip-types есть только в Node ≥ 22.6; на Node 20 (бокс,
// часть CI) типы снимает компилятор TypeScript (transpileModule). Тела
// функций берутся из vercelAnalyticsImpl.js как есть, без трансформации.
function headScriptFromSource(): string {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const call = "process.stdout.write(m.vercelAnalyticsHeadScript());";
  if (process.allowedNodeEnvironmentFlags.has('--experimental-strip-types')) {
    return execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        `const m = await import('./src/lib/vercelAnalytics.ts'); ${call}`,
      ],
      { encoding: 'utf8', cwd: root },
    );
  }
  const src = readFileSync(new URL('./vercelAnalytics.ts', import.meta.url), 'utf8');
  const implUrl = new URL('./vercelAnalyticsImpl.js', import.meta.url).href;
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace("'./vercelAnalyticsImpl.js'", JSON.stringify(implUrl)).replace('"./vercelAnalyticsImpl.js"', JSON.stringify(implUrl));
  const dir = mkdtempSync(join(tmpdir(), 'va-test-'));
  try {
    const file = join(dir, 'vercelAnalytics.mjs');
    writeFileSync(file, js);
    return execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `const m = await import(${JSON.stringify(pathToFileURL(file).href)}); ${call}`],
      { encoding: 'utf8', cwd: root },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function memoryStorage(initial: Record<string, string> = {}): VaStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function throwingStorage(): VaStorage {
  const fail = () => {
    throw new Error('storage blocked');
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

function page(search: string, hash = ''): VaWindow & { history: { state: unknown; url?: string; replaceState: (s: unknown, t: string, url?: string) => void } } {
  const history = {
    state: { n: 1 } as unknown,
    url: undefined as string | undefined,
    replaceState(state: unknown, _title: string, url?: string) {
      this.state = state;
      this.url = url;
    },
  };
  return {
    location: { pathname: '/minsk/tc', search, hash },
    history,
    localStorage: memoryStorage(),
  };
}

describe('isVercelAnalyticsDisabled', () => {
  it('считает непустой ключ отказом, пустой и отсутствующий — нет', () => {
    expect(isVercelAnalyticsDisabled(null)).toBe(false);
    expect(isVercelAnalyticsDisabled(undefined)).toBe(false);
    expect(isVercelAnalyticsDisabled(memoryStorage())).toBe(false);
    expect(isVercelAnalyticsDisabled(memoryStorage({ 'va-disable': '' }))).toBe(false);
    expect(isVercelAnalyticsDisabled(memoryStorage({ 'va-disable': '1' }))).toBe(true);
  });

  it('не бросает, если storage недоступен', () => {
    expect(isVercelAnalyticsDisabled(throwingStorage())).toBe(false);
  });
});

describe('applyVaDisableQuery', () => {
  it('?va-disable=1 включает, =0 снимает, прочее только вычищает параметр', () => {
    expect(applyVaDisableQuery('')).toEqual({ action: 'none', search: '' });
    expect(applyVaDisableQuery('?city=minsk')).toEqual({ action: 'none', search: 'city=minsk' });
    expect(applyVaDisableQuery('?va-disable=1&city=minsk')).toEqual({ action: 'set', search: 'city=minsk' });
    expect(applyVaDisableQuery('city=minsk&va-disable=0')).toEqual({ action: 'remove', search: 'city=minsk' });
    expect(applyVaDisableQuery('?va-disable=yes')).toEqual({ action: 'strip', search: '' });
  });
});

describe('vercelAnalyticsBeforeSend', () => {
  it('возвращает null, пока флаг стоит, и само событие, когда его нет', () => {
    const event = { url: 'https://officelist.pro/minsk/bc' };
    expect(vercelAnalyticsBeforeSend(event, memoryStorage({ 'va-disable': '1' }))).toBeNull();
    expect(vercelAnalyticsBeforeSend(event, memoryStorage())).toBe(event);
    expect(vercelAnalyticsBeforeSend(event, null)).toBe(event);
    expect(vercelAnalyticsBeforeSend(event, throwingStorage())).toBe(event);
  });
});

describe('installVercelAnalyticsOptOut', () => {
  it('до счётчика пишет флаг и убирает параметр, сохраняя остальные и hash', () => {
    const win = page('?va-disable=1&city=minsk', '#map');
    installVercelAnalyticsOptOut(win);
    expect(win.localStorage?.getItem('va-disable')).toBe('1');
    expect(win.history.url).toBe('/minsk/tc?city=minsk#map');
    expect(vercelAnalyticsBeforeSend({ url: '/minsk/tc' }, win.localStorage)).toBeNull();
  });

  it('?va-disable=0 снимает флаг', () => {
    const win = page('?va-disable=0');
    win.localStorage?.setItem('va-disable', '1');
    installVercelAnalyticsOptOut(win);
    expect(win.localStorage?.getItem('va-disable')).toBeNull();
    expect(win.history.url).toBe('/minsk/tc');
    expect(vercelAnalyticsBeforeSend({ url: '/minsk/tc' }, win.localStorage)).toEqual({ url: '/minsk/tc' });
  });

  it('без window и без history не бросает', () => {
    expect(() => installVercelAnalyticsOptOut(null)).not.toThrow();
    expect(() => installVercelAnalyticsOptOut(undefined)).not.toThrow();
    expect(() => installVercelAnalyticsOptOut({ location: { pathname: '/', search: '?va-disable=1', hash: '' } })).not.toThrow();
  });

  it('закрытый storage не роняет страницу и всё равно чистит адрес', () => {
    const win = page('?utm=ad&va-disable=1', '#x');
    win.localStorage = throwingStorage();
    expect(() => installVercelAnalyticsOptOut(win)).not.toThrow();
    expect(win.history.url).toBe('/minsk/tc?utm=ad#x');
  });
});

describe('index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('вшивает тот же хелпер и регистрирует beforeSend до загрузки скрипта', () => {
    expect(html).toContain(headScriptFromSource());
    const gate = html.indexOf('id="vercel-analytics-gate"');
    const beforeSend = html.indexOf("va('beforeSend'");
    const append = html.indexOf('appendChild(vaScript)');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(beforeSend);
    expect(beforeSend).toBeLessThan(append);
  });

  it('скрипт страницы ставит флаг и отбрасывает событие ещё до инсайтов', () => {
    const match = html.match(/<script type="text\/javascript" id="vercel-analytics-gate">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const storage = memoryStorage();
    const history = {
      state: null as unknown,
      url: '' as string,
      replaceState(_state: unknown, _title: string, url?: string) {
        this.url = url ?? '';
      },
    };
    const window = {
      location: { pathname: '/minsk/bc', search: '?va-disable=1', hash: '' },
      history,
      localStorage: storage,
      __vaDisabled: false,
    };
    const sandbox = { window, URLSearchParams };
    vm.createContext(sandbox);
    expect(() => vm.runInContext(match![1], sandbox)).not.toThrow();
    expect(storage.getItem('va-disable')).toBe('1');
    expect(history.url).toBe('/minsk/bc');
    const beforeSend = (sandbox.window as { __vercelAnalyticsBeforeSend?: (event: { url: string }) => unknown })
      .__vercelAnalyticsBeforeSend;
    expect(typeof beforeSend).toBe('function');
    expect(beforeSend!({ url: 'https://malllist.pro/minsk/tc' })).toBeNull();
  });

  it('при закрытом storage событие этого захода всё равно не уходит', () => {
    const match = html.match(/<script type="text\/javascript" id="vercel-analytics-gate">([\s\S]*?)<\/script>/);
    const window = {
      location: { pathname: '/', search: '?va-disable=1', hash: '#a' },
      history: {
        state: null,
        url: '',
        replaceState(_s: unknown, _t: string, url?: string) {
          this.url = url ?? '';
        },
      },
      get localStorage() {
        throw new Error('blocked');
      },
      __vaDisabled: false,
    };
    const sandbox = { window, URLSearchParams };
    vm.createContext(sandbox);
    expect(() => vm.runInContext(match![1], sandbox)).not.toThrow();
    expect(window.history.url).toBe('/#a');
    const beforeSend = (sandbox.window as { __vercelAnalyticsBeforeSend?: (event: { url: string }) => unknown })
      .__vercelAnalyticsBeforeSend;
    expect(beforeSend!({ url: '/' })).toBeNull();
  });
});
