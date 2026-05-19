import type {
  DetectionGlobals,
  NavigatorLike,
  StorageManagerLike,
  WindowLike,
} from '../src/types.ts';

/** Reasonable disk quota for a desktop in normal mode: 100 GiB. */
export const NORMAL_QUOTA = 100 * 1024 * 1024 * 1024;
/** Restricted-storage quota typical of Chromium incognito: 32 MiB. */
export const PRIVATE_QUOTA = 32 * 1024 * 1024;

const USER_AGENTS = {
  chromium:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  firefox:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  edgeLegacy:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763',
  ie: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)',
  webkit:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) MyShell/1.0',
  unknown: '',
};

interface BuildOptions {
  quota?: number | undefined;
  storage?: 'present' | 'missing';
  localStorage?: 'works' | 'throws' | 'missing';
  openDatabase?: 'works' | 'throws' | 'missing';
  indexedDB?: 'works' | 'throws' | 'missing';
  hasPointerEvent?: boolean;
  vendor?: string;
}

export function buildGlobals(
  browser: keyof typeof USER_AGENTS,
  opts: BuildOptions = {},
): DetectionGlobals {
  const navigator: NavigatorLike = {
    userAgent: USER_AGENTS[browser],
    vendor:
      opts.vendor ??
      (browser === 'safari' ? 'Apple Computer, Inc.' : 'Google Inc.'),
    ...(opts.storage === 'missing' ? {} : { storage: makeStorage(opts.quota) }),
  };

  const idb = makeIndexedDB(opts.indexedDB ?? 'missing');
  const window: WindowLike = {
    ...(idb === undefined ? {} : { indexedDB: idb }),
    ...(opts.localStorage === 'missing'
      ? {}
      : { localStorage: makeLocalStorage(opts.localStorage ?? 'works') }),
    ...(opts.openDatabase === 'missing'
      ? {}
      : { openDatabase: makeOpenDatabase(opts.openDatabase ?? 'works') }),
    ...(opts.hasPointerEvent ? { PointerEvent: function PE() {} } : {}),
  };

  return {
    navigator,
    window,
    ...(idb === undefined ? {} : { indexedDB: idb }),
  };
}

function makeStorage(quota: number | undefined): StorageManagerLike {
  return {
    estimate: () =>
      Promise.resolve(quota === undefined ? {} : { quota, usage: 0 }),
  };
}

function makeLocalStorage(mode: 'works' | 'throws') {
  return {
    setItem: (_k: string, _v: string) => {
      if (mode === 'throws')
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    },
    removeItem: (_k: string) => {},
  };
}

function makeOpenDatabase(mode: 'works' | 'throws') {
  return (
    _n: string | null,
    _v: string | null,
    _d: string | null,
    _e: number | null,
  ) => {
    if (mode === 'throws') throw new Error('openDatabase blocked');
    return { mock: true };
  };
}

function makeIndexedDB(
  mode: 'works' | 'throws' | 'missing',
): IDBFactory | undefined {
  if (mode === 'missing') return undefined;
  return {
    open: () => {
      const listeners: Record<string, (() => void)[]> = {};
      const request = {
        result: { close: () => {} },
        error: null,
        readyState: 'pending',
        source: null,
        transaction: null,
        onsuccess: null,
        onerror: null,
        addEventListener: (name: string, cb: () => void) => {
          (listeners[name] ??= []).push(cb);
        },
        removeEventListener: () => {},
        dispatchEvent: () => true,
      } as unknown as IDBOpenDBRequest;

      queueMicrotask(() => {
        const target = mode === 'throws' ? 'error' : 'success';
        for (const cb of listeners[target] ?? []) cb();
      });

      return request;
    },
    deleteDatabase: () => ({}) as IDBOpenDBRequest,
    cmp: () => 0,
    databases: () => Promise.resolve([]),
  } as unknown as IDBFactory;
}
