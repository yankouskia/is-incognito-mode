/**
 * `is-incognito-mode` — detect private / incognito browsing.
 *
 * @packageDocumentation
 */

export type { BrowserName } from './browser.ts';
export {
  detectIncognito,
  isIncognito,
  isIncognito as default,
} from './detect.ts';
export {
  IncognitoDetectionError,
  type IncognitoDetectionErrorCode,
} from './errors.ts';
export { DEFAULT_PRIVATE_QUOTA_BYTES } from './strategies.ts';
export type {
  DeprecatedStorageQuota,
  DetectionConfidence,
  DetectionGlobals,
  DetectionResult,
  DetectionStrategyName,
  DetectIncognitoOptions,
  NavigatorLike,
  PerformanceLike,
  StorageManagerLike,
  StorageLike,
  WindowLike,
} from './types.ts';
