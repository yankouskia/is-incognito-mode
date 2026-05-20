import type { BrowserName } from './browser.ts';
import { IncognitoDetectionError } from './errors.ts';
import type {
  DetectIncognitoOptions,
  DetectionGlobals,
  DetectionResult,
} from './types.ts';

/**
 * Fallback JS-heap ceiling (1 GiB) used by the Chromium strategy when
 * `performance.memory.jsHeapSizeLimit` is unavailable. Also exported as the
 * reference value for the `privateQuotaThresholdBytes` advanced override.
 */
export const DEFAULT_PRIVATE_QUOTA_BYTES = 1024 * 1024 * 1024;

/**
 * The Chromium temporary-storage quota in an incognito tab stays below roughly
 * twice the JS-heap ceiling (it is memory-bound, not disk-bound). Normal tabs
 * are disk-bound and far above it.
 */
const HEAP_QUOTA_MULTIPLIER = 2;

/**
 * Sentinel key used by the legacy localStorage / indexedDB probes. Random
 * enough that collisions with real user keys are impossible.
 */
const PROBE_KEY = '__is_incognito_mode_probe_cd1394e6__';

/**
 * Try strategies in priority order, returning the first one that produces a
 * definitive answer. Throws {@link IncognitoDetectionError} if every strategy
 * declines.
 */
export async function runStrategies(
  browser: BrowserName,
  globals: DetectionGlobals,
  options: Pick<DetectIncognitoOptions, 'privateQuotaThresholdBytes'>,
): Promise<DetectionResult> {
  const errors: unknown[] = [];

  switch (browser) {
    case 'chromium': {
      const result = await attempt(
        () => detectViaChromiumQuota(browser, globals, options),
        errors,
      );
      if (result !== null) return result;
      break;
    }
    case 'firefox': {
      const opfs = await attempt(
        () => detectViaOpfsProbe(browser, globals, 'Security error'),
        errors,
      );
      if (opfs !== null) return opfs;
      const idb = await attempt(
        () => detectViaFirefoxIndexedDB(browser, globals),
        errors,
      );
      if (idb !== null) return idb;
      break;
    }
    case 'safari':
    case 'webkit': {
      const opfs = await attempt(
        () => detectViaOpfsProbe(browser, globals, 'unknown transient reason'),
        errors,
      );
      if (opfs !== null) return opfs;
      const legacy = await attempt(
        () => detectViaSafariStorage(browser, globals),
        errors,
      );
      if (legacy !== null) return legacy;
      break;
    }
    case 'edge-legacy':
    case 'ie': {
      const result = await attempt(
        () => detectViaLegacyEdge(browser, globals),
        errors,
      );
      if (result !== null) return result;
      break;
    }
    case 'unknown': {
      break;
    }
  }

  throw new IncognitoDetectionError(
    browser === 'unknown' ? 'UNSUPPORTED_BROWSER' : 'PROBE_FAILED',
    `No detection strategy produced a verdict for browser "${browser}".`,
    errors.length > 0 ? { cause: errors[0] } : undefined,
  );
}

async function attempt(
  strategy: () => DetectionResult | null | Promise<DetectionResult | null>,
  errors: unknown[],
): Promise<DetectionResult | null> {
  try {
    return await strategy();
  } catch (error) {
    errors.push(error);
    return null;
  }
}

/**
 * Chromium family (Chrome, Edge, Brave, Opera, …).
 *
 * Modern Chrome deliberately fakes `navigator.storage.estimate().quota` at
 * `usage + 10 GiB` in *every* mode to defeat detection — so that API is
 * useless here. The legacy `navigator.webkitTemporaryStorage` API was not
 * given the same treatment and still reports the real per-origin quota:
 * disk-bound (huge) in normal mode, memory-bound (small) in incognito.
 *
 * We compare it to `performance.memory.jsHeapSizeLimit` — a per-renderer
 * constant that does not change between modes — so the test adapts to the
 * device instead of relying on a brittle fixed byte count.
 */
async function detectViaChromiumQuota(
  browser: BrowserName,
  globals: DetectionGlobals,
  options: Pick<DetectIncognitoOptions, 'privateQuotaThresholdBytes'>,
): Promise<DetectionResult | null> {
  const tempStorage = globals.navigator?.webkitTemporaryStorage;
  if (typeof tempStorage?.queryUsageAndQuota !== 'function') return null;

  const quota = await new Promise<number | null>((resolve) => {
    let settled = false;
    const settle = (value: number | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      tempStorage.queryUsageAndQuota(
        (_used, grantedQuota) => {
          settle(typeof grantedQuota === 'number' ? grantedQuota : null);
        },
        () => {
          settle(null);
        },
      );
    } catch {
      settle(null);
    }
  });
  if (quota === null) return null;

  const isPrivate =
    options.privateQuotaThresholdBytes === undefined
      ? quota < chromiumHeapLimit(globals) * HEAP_QUOTA_MULTIPLIER
      : quota < options.privateQuotaThresholdBytes;

  return {
    isPrivate,
    browser,
    confidence: 'high',
    quota,
    strategy: 'chromium-quota',
  };
}

function chromiumHeapLimit(globals: DetectionGlobals): number {
  const limit = globals.window?.performance?.memory?.jsHeapSizeLimit;
  return typeof limit === 'number' && limit > 0
    ? limit
    : DEFAULT_PRIVATE_QUOTA_BYTES;
}

/**
 * Firefox and Safari: the Origin Private File System
 * (`navigator.storage.getDirectory()`) is rejected in private mode. The
 * rejection message differs per engine — Firefox says `Security error`,
 * Safari says `unknown transient reason` — so the caller passes the fragment
 * to match. A successful resolve means a normal window.
 */
async function detectViaOpfsProbe(
  browser: BrowserName,
  globals: DetectionGlobals,
  privateErrorFragment: string,
): Promise<DetectionResult | null> {
  const storage = globals.navigator?.storage;
  if (typeof storage?.getDirectory !== 'function') return null;

  try {
    await storage.getDirectory();
    return {
      isPrivate: false,
      browser,
      confidence: 'high',
      quota: null,
      strategy: 'opfs-probe',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isPrivate: message.includes(privateErrorFragment),
      browser,
      confidence: 'high',
      quota: null,
      strategy: 'opfs-probe',
    };
  }
}

/** Older Safari / WebKit without OPFS: localStorage + openDatabase probes. */
function detectViaSafariStorage(
  browser: BrowserName,
  globals: DetectionGlobals,
): DetectionResult | null {
  const storage = globals.window?.localStorage;
  if (!storage) {
    // No localStorage at all is a strong signal on Safari < 11 private.
    return {
      isPrivate: true,
      browser,
      confidence: 'low',
      quota: null,
      strategy: 'safari-storage',
    };
  }

  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
  } catch {
    return {
      isPrivate: true,
      browser,
      confidence: 'medium',
      quota: null,
      strategy: 'safari-storage',
    };
  }

  const win = globals.window;
  if (typeof win.openDatabase === 'function') {
    try {
      win.openDatabase(null, null, null, null);
    } catch {
      return {
        isPrivate: true,
        browser,
        confidence: 'low',
        quota: null,
        strategy: 'safari-storage',
      };
    }
  }

  return {
    isPrivate: false,
    browser,
    confidence: 'low',
    quota: null,
    strategy: 'safari-storage',
  };
}

/** Older Firefox without OPFS: `indexedDB.open` fails in private mode. */
async function detectViaFirefoxIndexedDB(
  browser: BrowserName,
  globals: DetectionGlobals,
): Promise<DetectionResult | null> {
  const indexedDB = globals.indexedDB ?? globals.window?.indexedDB;
  if (!indexedDB) {
    return {
      isPrivate: true,
      browser,
      confidence: 'low',
      quota: null,
      strategy: 'firefox-indexeddb',
    };
  }

  return new Promise<DetectionResult>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(PROBE_KEY);
    } catch {
      resolve({
        isPrivate: true,
        browser,
        confidence: 'low',
        quota: null,
        strategy: 'firefox-indexeddb',
      });
      return;
    }

    request.addEventListener('error', () => {
      resolve({
        isPrivate: true,
        browser,
        confidence: 'low',
        quota: null,
        strategy: 'firefox-indexeddb',
      });
    });
    request.addEventListener('success', () => {
      try {
        request.result.close();
        indexedDB.deleteDatabase(PROBE_KEY);
      } catch {
        /* best-effort cleanup */
      }
      resolve({
        isPrivate: false,
        browser,
        confidence: 'low',
        quota: null,
        strategy: 'firefox-indexeddb',
      });
    });
  });
}

/** Legacy Edge / IE: no `indexedDB` while `PointerEvent` exists → private. */
function detectViaLegacyEdge(
  browser: BrowserName,
  globals: DetectionGlobals,
): DetectionResult | null {
  const win = globals.window;
  if (!win) return null;
  const hasIndexedDB = Boolean(win.indexedDB ?? globals.indexedDB);
  const hasPointer = Boolean(win.PointerEvent ?? win.MSPointerEvent);
  return {
    isPrivate: !hasIndexedDB && hasPointer,
    browser,
    confidence: 'low',
    quota: null,
    strategy: 'legacy-edge',
  };
}
