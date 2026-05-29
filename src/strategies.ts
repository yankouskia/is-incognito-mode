import type { BrowserName } from './browser.ts';
import { IncognitoDetectionError } from './errors.ts';
import type {
  DetectIncognitoOptions,
  DetectionGlobals,
  DetectionResult,
} from './types.ts';

/**
 * Default cutoff (9.5 GiB) for the Chromium storage-headroom strategy.
 *
 * Chrome's `predictable-reported-quota` mitigation (default since Chromium 147)
 * reports `navigator.storage.estimate()` quota as `usage + 10 GiB` in a normal
 * tab but `usage + 9 GiB` in an incognito tab. The *headroom* — `quota - usage`
 * — is therefore a stable 10 GiB vs 9 GiB. 9.5 GiB is the midpoint: below it
 * means incognito, above it means normal.
 *
 * Older Chromium (< 147) reported a small dynamic quota in incognito and a
 * disk-bound quota (tens-to-hundreds of GiB) in a normal tab, so the same
 * 9.5 GiB cutoff classifies those correctly too.
 */
export const DEFAULT_PRIVATE_QUOTA_BYTES = 9.5 * 1024 * 1024 * 1024;

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
  signal?: AbortSignal,
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
        () => detectViaFirefoxIndexedDB(browser, globals, signal),
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
 * Reads `navigator.storage.estimate()` and looks at the **headroom**
 * (`quota - usage`). Chrome's `predictable-reported-quota` mitigation reports a
 * 10 GiB headroom for a normal tab and a 9 GiB headroom for an incognito tab —
 * a stable 1 GiB gap. Subtracting `usage` cancels out the part of the quota
 * that tracks real consumption, leaving just that offset.
 */
async function detectViaChromiumQuota(
  browser: BrowserName,
  globals: DetectionGlobals,
  options: Pick<DetectIncognitoOptions, 'privateQuotaThresholdBytes'>,
): Promise<DetectionResult | null> {
  const storage = globals.navigator?.storage;
  if (typeof storage?.estimate !== 'function') return null;

  const estimate = await storage.estimate();
  if (typeof estimate.quota !== 'number') return null;

  const quota = estimate.quota;
  const usage = typeof estimate.usage === 'number' ? estimate.usage : 0;
  const headroom = quota - usage;
  const threshold =
    options.privateQuotaThresholdBytes ?? DEFAULT_PRIVATE_QUOTA_BYTES;

  return {
    isPrivate: headroom < threshold,
    browser,
    confidence: 'high',
    quota,
    strategy: 'chromium-quota',
  };
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

/**
 * Older Firefox without OPFS: `indexedDB.open` fails in private mode.
 *
 * The verdict arrives asynchronously via the request's `success` / `error`
 * events — and in rare states (e.g. a `blocked` upgrade) neither ever fires,
 * which is the one place detection can stall. An optional `signal` lets the
 * caller abandon the probe: on abort the event listeners are detached so no
 * dangling references survive, and the promise rejects.
 */
async function detectViaFirefoxIndexedDB(
  browser: BrowserName,
  globals: DetectionGlobals,
  signal?: AbortSignal,
): Promise<DetectionResult | null> {
  const indexedDB = globals.indexedDB ?? globals.window?.indexedDB;
  const privateResult: DetectionResult = {
    isPrivate: true,
    browser,
    confidence: 'low',
    quota: null,
    strategy: 'firefox-indexeddb',
  };
  if (!indexedDB) return privateResult;

  return new Promise<DetectionResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new IncognitoDetectionError('ABORTED', 'Detection was aborted.'));
      return;
    }
    let request: IDBOpenDBRequest | undefined;
    const onAbort = () => {
      cleanup();
      reject(new IncognitoDetectionError('ABORTED', 'Detection was aborted.'));
    };
    const onError = () => {
      cleanup();
      resolve(privateResult);
    };
    const onSuccess = () => {
      cleanup();
      try {
        request?.result.close();
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
    };
    function cleanup(): void {
      signal?.removeEventListener('abort', onAbort);
      request?.removeEventListener('error', onError);
      request?.removeEventListener('success', onSuccess);
    }

    try {
      request = indexedDB.open(PROBE_KEY);
    } catch {
      resolve(privateResult);
      return;
    }
    request.addEventListener('error', onError);
    request.addEventListener('success', onSuccess);
    signal?.addEventListener('abort', onAbort);
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
