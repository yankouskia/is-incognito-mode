import type { BrowserName } from './browser.ts';

/**
 * Qualitative confidence in a detection outcome.
 *
 * - `high` — A direct, hard-to-fake signal (the Chromium temporary-storage
 *   quota probe, or an OPFS access rejection in Firefox / Safari private mode).
 * - `medium` — A heuristic that is right the overwhelming majority of the
 *   time but has known false-positive scenarios.
 * - `low` — A best-effort fallback (legacy-browser heuristics).
 */
export type DetectionConfidence = 'high' | 'medium' | 'low';

/**
 * Rich result returned by {@link detectIncognito}.
 */
export interface DetectionResult {
  /** Whether the browser appears to be in private / incognito mode. */
  readonly isPrivate: boolean;
  /** Coarse engine the detector classified the browser as. */
  readonly browser: BrowserName;
  /** Detector's qualitative confidence in `isPrivate`. */
  readonly confidence: DetectionConfidence;
  /**
   * Storage quota in bytes that informed the verdict, when a quota-based
   * strategy was used. `null` for strategies that do not read a quota
   * (OPFS probe, legacy heuristics).
   */
  readonly quota: number | null;
  /** Identifier of the strategy that produced the verdict. */
  readonly strategy: DetectionStrategyName;
}

/**
 * Stable identifiers for the detection strategies. Useful for debugging and
 * analytics.
 *
 * - `chromium-quota` — Chromium-family: the legacy
 *   `navigator.webkitTemporaryStorage.queryUsageAndQuota` quota compared to
 *   `performance.memory.jsHeapSizeLimit`. This is the only Chromium signal
 *   that still works: modern Chrome fakes `navigator.storage.estimate()` at
 *   `usage + 10 GiB` in every mode specifically to defeat detection.
 * - `opfs-probe` — Firefox / Safari: `navigator.storage.getDirectory()`
 *   (Origin Private File System) is rejected in private mode.
 * - `firefox-indexeddb` — Older Firefox without OPFS: `indexedDB.open` error.
 * - `safari-storage` — Older Safari / WebKit without OPFS: `localStorage` +
 *   `openDatabase` probes.
 * - `legacy-edge` — Legacy Edge / IE: `PointerEvent` + `indexedDB` heuristic.
 */
export type DetectionStrategyName =
  | 'chromium-quota'
  | 'opfs-probe'
  | 'firefox-indexeddb'
  | 'safari-storage'
  | 'legacy-edge';

/**
 * Options for {@link detectIncognito}.
 */
export interface DetectIncognitoOptions {
  /**
   * Override the global `navigator` / `window` / `indexedDB` lookups. Used in
   * tests; in production the live globals are used.
   */
  readonly globals?: DetectionGlobals;
  /**
   * **Advanced override.** When set, the Chromium strategy classifies the tab
   * as private if the legacy temporary-storage quota is below this many bytes,
   * instead of the default heap-relative heuristic.
   *
   * Leave this unset unless you have measured your audience: the default
   * compares the quota to `performance.memory.jsHeapSizeLimit`, which adapts
   * to the device automatically and is far more robust than any fixed number.
   */
  readonly privateQuotaThresholdBytes?: number;
}

/**
 * Subset of browser globals the detector consults. Exposed as an interface so
 * tests can inject mocks without monkey-patching `globalThis`.
 */
export interface DetectionGlobals {
  readonly navigator?: NavigatorLike | undefined;
  readonly window?: WindowLike | undefined;
  readonly indexedDB?: IDBFactory | undefined;
}

export interface NavigatorLike {
  readonly userAgent: string;
  readonly vendor?: string;
  readonly storage?: StorageManagerLike | undefined;
  /**
   * Legacy, non-standard quota API. Still present in Chromium and — unlike the
   * modern Storage API — still reports the *real* per-origin quota, which is
   * what makes incognito detection possible.
   */
  readonly webkitTemporaryStorage?: DeprecatedStorageQuota | undefined;
}

export interface StorageManagerLike {
  estimate?(): Promise<{ quota?: number; usage?: number }>;
  /** Origin Private File System root. Rejected in Firefox / Safari private mode. */
  getDirectory?(): Promise<unknown>;
}

/**
 * The legacy `navigator.webkitTemporaryStorage` shape. `queryUsageAndQuota`
 * invokes `onSuccess(usedBytes, grantedQuotaBytes)`.
 */
export interface DeprecatedStorageQuota {
  queryUsageAndQuota(
    onSuccess: (usedBytes: number, grantedQuotaBytes: number) => void,
    onError?: (error: unknown) => void,
  ): void;
}

export interface WindowLike {
  readonly indexedDB?: IDBFactory | undefined;
  readonly localStorage?: StorageLike | undefined;
  readonly PointerEvent?: unknown;
  readonly MSPointerEvent?: unknown;
  readonly performance?: PerformanceLike | undefined;
  openDatabase?(
    name: string | null,
    version: string | null,
    displayName: string | null,
    estimatedSize: number | null,
  ): unknown;
}

/**
 * Subset of `window.performance`. `memory` is a non-standard Chromium-only
 * property; `jsHeapSizeLimit` is the per-renderer JS heap ceiling, which is
 * stable across normal and incognito modes and therefore a reliable
 * device-relative yardstick.
 */
export interface PerformanceLike {
  readonly memory?: { readonly jsHeapSizeLimit?: number } | undefined;
}

export interface StorageLike {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
