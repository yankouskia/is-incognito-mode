import type { BrowserName } from './browser.ts';
import { IncognitoDetectionError } from './errors.ts';
import type {
  DetectIncognitoOptions,
  DetectionGlobals,
  DetectionResult,
} from './types.ts';

/**
 * Default cutoff: 1 GiB. Below this, every shipping browser we tested is in a
 * restricted (private) storage context; above, it is normal.
 *
 * History: pre-2022 Chrome capped incognito at ~120 MiB and that was the
 * canonical threshold. Chrome 110+ raised the incognito ceiling and modern
 * versions can report 500 MiB–1 GiB for an incognito tab on a desktop, so the
 * old 120 MiB threshold misses Chromium-family private mode. 1 GiB
 * (1024 × 1024 × 1024) is the value the actively maintained `detectIncognito`
 * library settled on; we match it.
 *
 * On normal-mode desktops the quota is typically 10–80 % of free disk —
 * tens or hundreds of GiB — so this threshold has substantial margin.
 *
 * Devices with very small total storage (low-end mobiles, restricted ChromeOS
 * profiles) may produce false positives. Override with
 * `privateQuotaThresholdBytes` if that matters to you.
 */
export const DEFAULT_PRIVATE_QUOTA_BYTES = 1024 * 1024 * 1024;

/**
 * Sentinel key used by the legacy localStorage probe. Random enough that
 * collisions with real user keys are impossible.
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
  options: Required<Pick<DetectIncognitoOptions, 'privateQuotaThresholdBytes'>>,
): Promise<DetectionResult> {
  const errors: unknown[] = [];

  // 1. navigator.storage.estimate — the modern, vendor-blessed-ish signal.
  if (canUseStorageEstimate(globals)) {
    try {
      const result = await detectViaStorageQuota(browser, globals, options);
      if (result !== null) return result;
    } catch (error) {
      errors.push(error);
    }
  }

  // 2. Per-engine fallbacks for older versions / restricted runtimes.
  switch (browser) {
    case 'safari':
    case 'webkit': {
      const result = detectViaSafariStorage(browser, globals);
      if (result !== null) return result;
      break;
    }
    case 'firefox': {
      const result = await detectViaFirefoxIndexedDB(browser, globals);
      if (result !== null) return result;
      break;
    }
    case 'edge-legacy':
    case 'ie': {
      const result = detectViaLegacyEdge(browser, globals);
      if (result !== null) return result;
      break;
    }
    case 'chromium':
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

function canUseStorageEstimate(globals: DetectionGlobals): boolean {
  return typeof globals.navigator?.storage?.estimate === 'function';
}

async function detectViaStorageQuota(
  browser: BrowserName,
  globals: DetectionGlobals,
  options: Required<Pick<DetectIncognitoOptions, 'privateQuotaThresholdBytes'>>,
): Promise<DetectionResult | null> {
  const storage = globals.navigator?.storage;
  if (!storage?.estimate) return null;

  const estimate = await storage.estimate();
  const quota = typeof estimate.quota === 'number' ? estimate.quota : null;
  if (quota === null) return null;

  const isPrivate = quota < options.privateQuotaThresholdBytes;
  return {
    isPrivate,
    browser,
    confidence: 'high',
    quota,
    strategy: 'storage-quota',
  };
}

function detectViaSafariStorage(
  browser: BrowserName,
  globals: DetectionGlobals,
): DetectionResult | null {
  const storage = globals.window?.localStorage;
  if (!storage) {
    // No localStorage at all is itself a strong signal on Safari < 11 private.
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

function detectViaLegacyEdge(
  browser: BrowserName,
  globals: DetectionGlobals,
): DetectionResult | null {
  const win = globals.window;
  if (!win) return null;
  const hasIndexedDB = Boolean(win.indexedDB ?? globals.indexedDB);
  const hasPointer = Boolean(win.PointerEvent ?? win.MSPointerEvent);
  if (!hasIndexedDB && hasPointer) {
    return {
      isPrivate: true,
      browser,
      confidence: 'low',
      quota: null,
      strategy: 'legacy-edge',
    };
  }
  return {
    isPrivate: false,
    browser,
    confidence: 'low',
    quota: null,
    strategy: 'legacy-edge',
  };
}
