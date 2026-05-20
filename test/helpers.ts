import type {
  DeprecatedStorageQuota,
  DetectionGlobals,
  NavigatorLike,
  PerformanceLike,
  StorageManagerLike,
  WindowLike,
} from '../src/types.ts';

/** Disk-bound temporary-storage quota for a normal Chromium tab: 200 GiB. */
export const NORMAL_TEMP_QUOTA = 200 * 1024 * 1024 * 1024;
/** Memory-bound temporary-storage quota for a Chromium incognito tab: 600 MiB. */
export const PRIVATE_TEMP_QUOTA = 600 * 1024 * 1024;
/** Typical desktop `performance.memory.jsHeapSizeLimit`: 4 GiB. */
export const DESKTOP_HEAP_LIMIT = 4 * 1024 * 1024 * 1024;

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

/** The OPFS rejection message each engine produces in private mode. */
const OPFS_PRIVATE_MESSAGE: Record<string, string> = {
  firefox: 'NotAllowedError: Security error when calling getDirectory',
  safari: 'UnknownError: unknown transient reason',
  webkit: 'UnknownError: unknown transient reason',
};

interface BuildOptions {
  /** Chromium `webkitTemporaryStorage` quota in bytes, or `'error'`. Omit to leave the API absent. */
  tempQuota?: number | 'error';
  /** Chromium `performance.memory.jsHeapSizeLimit`. Defaults to a 4 GiB desktop. `'missing'` drops it. */
  heapLimit?: number | 'missing';
  /** Firefox / Safari OPFS behaviour. Omit to leave `navigator.storage.getDirectory` absent. */
  opfs?: 'normal' | 'private' | 'other-error';
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
    ...(opts.opfs === undefined
      ? {}
      : { storage: makeStorageManager(browser, opts.opfs) }),
    ...(opts.tempQuota === undefined
      ? {}
      : { webkitTemporaryStorage: makeTempStorage(opts.tempQuota) }),
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
    ...(opts.heapLimit === 'missing'
      ? {}
      : { performance: makePerformance(opts.heapLimit ?? DESKTOP_HEAP_LIMIT) }),
  };

  return {
    navigator,
    window,
    ...(idb === undefined ? {} : { indexedDB: idb }),
  };
}

function makeStorageManager(
  browser: keyof typeof USER_AGENTS,
  opfs: 'normal' | 'private' | 'other-error',
): StorageManagerLike {
  return {
    getDirectory: () => {
      if (opfs === 'normal') return Promise.resolve({});
      if (opfs === 'other-error') {
        return Promise.reject(new Error('AbortError: unrelated failure'));
      }
      return Promise.reject(
        new Error(OPFS_PRIVATE_MESSAGE[browser] ?? 'unknown transient reason'),
      );
    },
  };
}

function makeTempStorage(quota: number | 'error'): DeprecatedStorageQuota {
  return {
    queryUsageAndQuota: (onSuccess, onError) => {
      if (quota === 'error') {
        onError?.(new Error('quota query failed'));
      } else {
        onSuccess(0, quota);
      }
    },
  };
}

function makePerformance(heapLimit: number): PerformanceLike {
  return { memory: { jsHeapSizeLimit: heapLimit } };
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
