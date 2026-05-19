import type { BrowserName } from './browser.ts';

/**
 * Qualitative confidence in a detection outcome.
 *
 * - `high` — A direct, hard-to-fake signal (e.g. a storage quota two orders of
 *   magnitude smaller than the device total).
 * - `medium` — A heuristic that is right the overwhelming majority of the
 *   time but has known false-positive scenarios (small devices, restricted
 *   storage profiles).
 * - `low` — A best-effort fallback (e.g. legacy-browser heuristics).
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
   * Total storage quota reported by `navigator.storage.estimate()`, in bytes,
   * when that API was available. `null` otherwise.
   */
  readonly quota: number | null;
  /** Identifier of the strategy that produced the verdict. */
  readonly strategy: DetectionStrategyName;
}

/**
 * Stable identifiers for the strategies. Useful for debugging and analytics.
 */
export type DetectionStrategyName =
  | 'storage-quota'
  | 'safari-storage'
  | 'firefox-indexeddb'
  | 'legacy-edge';

/**
 * Options for {@link detectIncognito}.
 */
export interface DetectIncognitoOptions {
  /**
   * Override the global `navigator` and `window`/`indexedDB` lookups. Used in
   * tests; in production the live globals are used.
   */
  readonly globals?: DetectionGlobals;
  /**
   * Override the quota cutoff (bytes) below which `storage-quota` classifies
   * the browser as private. Defaults to **120 MB** which matches the
   * Chromium / Firefox / Safari thresholds observed in 2023-2026.
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
}

export interface StorageManagerLike {
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

export interface WindowLike {
  readonly indexedDB?: IDBFactory | undefined;
  readonly localStorage?: StorageLike | undefined;
  readonly PointerEvent?: unknown;
  readonly MSPointerEvent?: unknown;
  openDatabase?(
    name: string | null,
    version: string | null,
    displayName: string | null,
    estimatedSize: number | null,
  ): unknown;
}

export interface StorageLike {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
