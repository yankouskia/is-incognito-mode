/**
 * Stable identifiers for {@link IncognitoDetectionError} causes.
 *
 * Branching on `code` is safer than parsing `message` strings.
 */
export type IncognitoDetectionErrorCode =
  /** Invoked in a non-browser context (Node, worker without globals, etc.). */
  | 'NOT_A_BROWSER'
  /** Browser detected but no supported detection strategy applies. */
  | 'UNSUPPORTED_BROWSER'
  /** A probe threw before it could produce a definitive result. */
  | 'PROBE_FAILED'
  /** Detection did not finish within the `timeoutMs` deadline. */
  | 'TIMEOUT'
  /** Detection was cancelled via the caller-supplied `signal`. */
  | 'ABORTED';

/**
 * Thrown when private-mode cannot be determined.
 *
 * @example
 * ```ts
 * import { isIncognito, IncognitoDetectionError } from 'is-incognito-mode';
 *
 * try {
 *   await isIncognito();
 * } catch (error) {
 *   if (error instanceof IncognitoDetectionError) {
 *     console.warn(error.code, error.message);
 *   }
 * }
 * ```
 */
export class IncognitoDetectionError extends Error {
  override readonly name = 'IncognitoDetectionError';
  readonly code: IncognitoDetectionErrorCode;

  constructor(
    code: IncognitoDetectionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = code;
  }
}
