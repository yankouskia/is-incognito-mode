import { detectBrowser } from './browser.ts';
import { IncognitoDetectionError } from './errors.ts';
import { runStrategies } from './strategies.ts';
import type {
  DetectIncognitoOptions,
  DetectionGlobals,
  DetectionResult,
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
 *   - `TIMEOUT` when `timeoutMs` elapsed before a verdict was reached.
 *   - `ABORTED` when the supplied `signal` was aborted.
 *
 * @example
 * ```ts
 * import { detectIncognito } from 'is-incognito-mode';
 *
 * const { isPrivate, browser, confidence, quota } = await detectIncognito();
 * console.log(`${browser} (${confidence} confidence, quota: ${quota ?? '?'})`);
 * ```
 *
 * @example Bound the call so a stalled probe can never freeze the caller:
 * ```ts
 * await detectIncognito({ timeoutMs: 5000 });
 * ```
 *
 * @example Cancel detection tied to a lifecycle:
 * ```ts
 * const controller = new AbortController();
 * await detectIncognito({ signal: controller.signal });
 * ```
 */
export async function detectIncognito(
  options: DetectIncognitoOptions = {},
): Promise<DetectionResult> {
  const { signal, timeoutMs } = options;

  if (signal?.aborted) {
    throw new IncognitoDetectionError(
      'ABORTED',
      'Detection was aborted before it started.',
      { cause: signal.reason },
    );
  }

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

  const strategyOptions =
    options.privateQuotaThresholdBytes === undefined
      ? {}
      : { privateQuotaThresholdBytes: options.privateQuotaThresholdBytes };

  // Fast path: with neither a deadline nor a signal, behave exactly as before —
  // no AbortController, no timer, no extra microtask.
  if (timeoutMs === undefined && !signal) {
    return runStrategies(browser, globals, strategyOptions);
  }

  return runBounded(
    (innerSignal) =>
      runStrategies(browser, globals, strategyOptions, innerSignal),
    signal,
    timeoutMs,
  );
}

/**
 * Race `work` against a deadline and/or an external abort signal. The two are
 * funneled through one internal {@link AbortController} whose signal is handed
 * to `work` so an in-flight probe can be abandoned. Whichever fires first wins:
 * a timer trip rejects with `TIMEOUT`, an external abort with `ABORTED`. The
 * timer and the external listener are always released in `finally`.
 */
async function runBounded(
  work: (signal: AbortSignal) => Promise<DetectionResult>,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): Promise<DetectionResult> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onExternalAbort = () => {
    controller.abort();
  };
  externalSignal?.addEventListener('abort', onExternalAbort);
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  const settledByAbort = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(
        timedOut
          ? new IncognitoDetectionError(
              'TIMEOUT',
              `Detection timed out after ${String(timeoutMs)} ms.`,
            )
          : new IncognitoDetectionError('ABORTED', 'Detection was aborted.', {
              cause: externalSignal?.reason,
            }),
      );
    });
  });

  try {
    return await Promise.race([work(controller.signal), settledByAbort]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Convenience wrapper around {@link detectIncognito} that resolves to the
 * boolean verdict only. Drop-in compatible with v1's default export.
 *
 * @example
 * ```ts
 * import { isIncognito } from 'is-incognito-mode';
 *
 * if (await isIncognito({ timeoutMs: 5000 })) {
 *   showPaywall();
 * }
 * ```
 *
 * @throws {IncognitoDetectionError} See {@link detectIncognito} — including
 *   `TIMEOUT` and `ABORTED` when `timeoutMs` / `signal` are used.
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
  return {
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
    window: typeof window === 'undefined' ? undefined : window,
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
