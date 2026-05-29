import type {
  DetectionGlobals,
  NavigatorLike,
  StorageManagerLike,
  WindowLike,
} from '../src/types.ts';

const GiB = 1024 * 1024 * 1024;

/** `quota - usage` Chrome 147+ reports for a normal tab: 10 GiB. */
export const NORMAL_HEADROOM = 10 * GiB;
/** `quota - usage` Chrome 147+ reports for an incognito tab: 9 GiB. */
export const PRIVATE_HEADROOM = 9 * GiB;

const USER_AGENTS = {
  chromium:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
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
  /** Chromium `navigator.storage.estimate()` resolved value. */
  estimate?: { quota?: number; usage?: number };
  /** Make `navigator.storage.estimate()` reject. */
  estimateRejects?: boolean;
  /** Make `navigator.storage.estimate()` never settle (stalled probe). */
  estimateHangs?: boolean;
  /** Drop `navigator.storage` entirely. */
  storage?: 'missing';
  /**
   * Firefox / Safari OPFS behaviour. Omit to leave `getDirectory` absent.
   * `'hangs'` returns a promise that never settles (stalled probe).
   */
  opfs?: 'normal' | 'private' | 'other-error' | 'hangs';
  localStorage?: 'works' | 'throws' | 'missing';
  openDatabase?: 'works' | 'throws' | 'missing';
  /** `'hangs'` opens a request that never fires `success`/`error`. */
  indexedDB?: 'works' | 'throws' | 'missing' | 'hangs';
  hasPointerEvent?: boolean;
  vendor?: string;
}

export function buildGlobals(
  browser: keyof typeof USER_AGENTS,
  opts: BuildOptions = {},
): DetectionGlobals {
  const storageManager = makeStorageManager(browser, opts);

  const navigator: NavigatorLike = {
    userAgent: USER_AGENTS[browser],
    vendor:
      opts.vendor ??
      (browser === 'safari' ? 'Apple Computer, Inc.' : 'Google Inc.'),
    ...(storageManager === undefined ? {} : { storage: storageManager }),
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

function makeStorageManager(
  browser: keyof typeof USER_AGENTS,
  opts: BuildOptions,
): StorageManagerLike | undefined {
  if (opts.storage === 'missing') return undefined;

  const manager: StorageManagerLike = {};
  let used = false;

  if (opts.estimateRejects) {
    manager.estimate = () => Promise.reject(new Error('estimate failed'));
    used = true;
  } else if (opts.estimateHangs) {
    manager.estimate = () => new Promise(() => {});
    used = true;
  } else if (opts.estimate) {
    const value = opts.estimate;
    manager.estimate = () => Promise.resolve(value);
    used = true;
  }

  if (opts.opfs !== undefined) {
    manager.getDirectory = () => {
      if (opts.opfs === 'normal') return Promise.resolve({});
      if (opts.opfs === 'hangs') return new Promise(() => {});
      if (opts.opfs === 'other-error') {
        return Promise.reject(new Error('AbortError: unrelated failure'));
      }
      return Promise.reject(
        new Error(OPFS_PRIVATE_MESSAGE[browser] ?? 'unknown transient reason'),
      );
    };
    used = true;
  }

  return used ? manager : undefined;
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
  mode: 'works' | 'throws' | 'missing' | 'hangs',
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

      // 'hangs' models a request that never fires success/error — the one
      // state in which detection can stall without a timeout/signal.
      if (mode !== 'hangs') {
        queueMicrotask(() => {
          const target = mode === 'throws' ? 'error' : 'success';
          for (const cb of listeners[target] ?? []) cb();
        });
      }

      return request;
    },
    deleteDatabase: () => ({}) as IDBOpenDBRequest,
    cmp: () => 0,
    databases: () => Promise.resolve([]),
  } as unknown as IDBFactory;
}
