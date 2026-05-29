import type { BrowserName } from './browser.ts';

/**
 * Qualitative confidence in a detection outcome.
 *
 * - `high` — A direct signal: the Chromium storage-headroom probe, or an OPFS
 *   access rejection in Firefox / Safari private mode.
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
   * Storage quota in bytes reported by `navigator.storage.estimate()` when the
   * quota strategy ran. `null` for the OPFS and legacy strategies.
   */
  readonly quota: number | null;
  /** Identifier of the strategy that produced the verdict. */
  readonly strategy: DetectionStrategyName;
}

/**
 * Stable identifiers for the detection strategies. Useful for debugging and
 * analytics.
 *
 * - `chromium-quota` — Chromium-family: the **headroom** of
 *   `navigator.storage.estimate()`, i.e. `quota - usage`. Chrome's
 *   `predictable-reported-quota` (default since Chromium 147) reports
 *   `quota = usage + 10 GiB` in a normal tab but `usage + 9 GiB` in incognito —
 *   a stable 1 GiB gap that survives the mitigation.
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
   * **Advanced override.** The Chromium strategy classifies a tab as private
   * when its storage *headroom* (`estimate().quota - estimate().usage`) is
   * below this many bytes. Defaults to **9.5 GiB** — the midpoint between the
   * 10 GiB headroom Chrome reports for a normal tab and the 9 GiB it reports
   * for an incognito tab.
   *
   * Only change this if you have measured your audience.
   */
  readonly privateQuotaThresholdBytes?: number;
  /**
   * Maximum time, in milliseconds, to wait for a verdict. If detection has not
   * settled by the deadline it rejects with an {@link IncognitoDetectionError}
   * whose `code` is `'TIMEOUT'`, and any in-flight storage probe is abandoned.
   *
   * Defaults to `undefined` — **no deadline** (legacy behaviour). Because a
   * storage probe can, in rare browser states, stall indefinitely (e.g. a
   * Firefox `indexedDB.open` request that never fires `success`/`error`),
   * passing a bound such as `5000` is **recommended on any critical render
   * path** (paywalls, analytics gates) so a stalled probe can never freeze the
   * calling code.
   *
   * @example
   * ```ts
   * await detectIncognito({ timeoutMs: 5000 });
   * ```
   */
  readonly timeoutMs?: number;
  /**
   * An {@link AbortSignal} that cancels detection. If it is already aborted
   * when {@link detectIncognito} is called, the call rejects synchronously;
   * if it aborts while a probe is running, the probe is abandoned. Either way
   * the rejection is an {@link IncognitoDetectionError} with `code: 'ABORTED'`.
   *
   * Pair it with a component lifecycle so a verdict that arrives after the user
   * has navigated away is discarded.
   *
   * @example
   * ```ts
   * const controller = new AbortController();
   * onCleanup(() => controller.abort());
   * await detectIncognito({ signal: controller.signal });
   * ```
   */
  readonly signal?: AbortSignal;
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
  /** Standard Storage API estimate. Drives the Chromium headroom strategy. */
  estimate?(): Promise<{ quota?: number; usage?: number }>;
  /** Origin Private File System root. Rejected in Firefox / Safari private mode. */
  getDirectory?(): Promise<unknown>;
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
