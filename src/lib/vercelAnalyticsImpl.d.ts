export const VA_DISABLE_KEY: 'va-disable';

export interface VaStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface VaWindowLike {
  location?: { pathname?: string; search?: string; hash?: string };
  history?: {
    state: unknown;
    replaceState(state: unknown, title: string, url?: string): void;
  };
  localStorage?: VaStorageLike;
  __vaDisabled?: boolean;
}

export interface VaDisableQuery {
  action: 'none' | 'set' | 'remove' | 'strip';
  search: string;
}

export function isVercelAnalyticsDisabledImpl(storage: VaStorageLike | null | undefined): boolean;

export function applyVaDisableQueryImpl(search: string): VaDisableQuery;

export function vercelAnalyticsBeforeSendImpl<E>(
  event: E,
  storage: VaStorageLike | null | undefined,
): E | null;

export function installVercelAnalyticsOptOutImpl(win: VaWindowLike | null | undefined): void;
