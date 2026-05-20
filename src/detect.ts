import { detectBrowser } from './browser.ts';
import { IncognitoDetectionError } from './errors.ts';
import { runStrategies } from './strategies.ts';
import type {
  DetectIncognitoOptions,
  DetectionGlobals,
  DetectionResult,
  WindowLike,
} from './types.ts';

/**
 * Detect whether the current browser is in private / incognito mode.
 *
 * Returns a rich {@link DetectionResult}. Most callers want the thinner
 * {@link isIncognito} convenience instead.
 *
 * @throws {IncognitoDetectionError}
 *   - `NOT_A_BROWSER` when invoked outside a browser-like environment.
 *   - `UNSUPPORTED_BROWSER` when the browser was classified as `unknown` and
 *     no fallback strategy applied.
 *   - `PROBE_FAILED` when every applicable strategy threw before producing a
 *     definitive answer.
 *
 * @example
 * ```ts
 * import { detectIncognito } from 'is-incognito-mode';
 *
 * const { isPrivate, browser, confidence, quota } = await detectIncognito();
 * console.log(`${browser} (${confidence} confidence, quota: ${quota ?? '?'})`);
 * ```
 */
export async function detectIncognito(
  options: DetectIncognitoOptions = {},
): Promise<DetectionResult> {
  const globals = resolveGlobals(options.globals);
  if (!isBrowserLike(globals)) {
    throw new IncognitoDetectionError(
      'NOT_A_BROWSER',
      'is-incognito-mode can only run in a browser-like environment.',
    );
  }

  const browser = detectBrowser({
    userAgent: globals.navigator.userAgent,
    ...(globals.navigator.vendor === undefined
      ? {}
      : { vendor: globals.navigator.vendor }),
  });

  return runStrategies(
    browser,
    globals,
    options.privateQuotaThresholdBytes === undefined
      ? {}
      : { privateQuotaThresholdBytes: options.privateQuotaThresholdBytes },
  );
}

/**
 * Convenience wrapper around {@link detectIncognito} that resolves to the
 * boolean verdict only. Drop-in compatible with v1's default export.
 *
 * @example
 * ```ts
 * import { isIncognito } from 'is-incognito-mode';
 *
 * if (await isIncognito()) {
 *   showPaywall();
 * }
 * ```
 *
 * @throws {IncognitoDetectionError} See {@link detectIncognito}.
 */
export async function isIncognito(
  options: DetectIncognitoOptions = {},
): Promise<boolean> {
  const result = await detectIncognito(options);
  return result.isPrivate;
}

function resolveGlobals(
  overrides: DetectionGlobals | undefined,
): DetectionGlobals {
  if (overrides) return overrides;
  // Boundary cast on `window`: the live object carries non-standard properties
  // the detector relies on (notably `performance.memory`) that the standard
  // DOM lib types do not declare.
  return {
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
    window:
      typeof window === 'undefined'
        ? undefined
        : (window as unknown as WindowLike),
    indexedDB: typeof indexedDB === 'undefined' ? undefined : indexedDB,
  };
}

function isBrowserLike(
  globals: DetectionGlobals,
): globals is DetectionGlobals & {
  navigator: NonNullable<DetectionGlobals['navigator']>;
} {
  return Boolean(globals.navigator?.userAgent);
}
