import { describe, expectTypeOf, it } from 'vitest';

import defaultExport, {
  DEFAULT_PRIVATE_QUOTA_BYTES,
  detectIncognito,
  isIncognito,
} from '../src/index.ts';
import type {
  BrowserName,
  DetectionConfidence,
  DetectionResult,
  DetectionStrategyName,
  DetectIncognitoOptions,
  IncognitoDetectionError,
  IncognitoDetectionErrorCode,
} from '../src/index.ts';

describe('public API types', () => {
  it('isIncognito returns Promise<boolean>', () => {
    expectTypeOf(isIncognito).returns.toEqualTypeOf<Promise<boolean>>();
  });

  it('detectIncognito returns Promise<DetectionResult>', () => {
    expectTypeOf(detectIncognito).returns.toEqualTypeOf<
      Promise<DetectionResult>
    >();
  });

  it('default export equals isIncognito', () => {
    expectTypeOf(defaultExport).toEqualTypeOf(isIncognito);
  });

  it('DetectionResult shape is stable', () => {
    expectTypeOf<DetectionResult['isPrivate']>().toEqualTypeOf<boolean>();
    expectTypeOf<DetectionResult['browser']>().toEqualTypeOf<BrowserName>();
    expectTypeOf<
      DetectionResult['confidence']
    >().toEqualTypeOf<DetectionConfidence>();
    expectTypeOf<DetectionResult['quota']>().toEqualTypeOf<number | null>();
    expectTypeOf<
      DetectionResult['strategy']
    >().toEqualTypeOf<DetectionStrategyName>();
  });

  it('DetectIncognitoOptions threshold is optional number', () => {
    expectTypeOf<
      DetectIncognitoOptions['privateQuotaThresholdBytes']
    >().toEqualTypeOf<number | undefined>();
  });

  it('DetectIncognitoOptions exposes timeoutMs and signal', () => {
    expectTypeOf<DetectIncognitoOptions['timeoutMs']>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<DetectIncognitoOptions['signal']>().toEqualTypeOf<
      AbortSignal | undefined
    >();
  });

  it('IncognitoDetectionError code is the literal union', () => {
    type FromErr = InstanceType<typeof IncognitoDetectionError>['code'];
    expectTypeOf<FromErr>().toEqualTypeOf<IncognitoDetectionErrorCode>();
    expectTypeOf<IncognitoDetectionErrorCode>().toEqualTypeOf<
      | 'NOT_A_BROWSER'
      | 'UNSUPPORTED_BROWSER'
      | 'PROBE_FAILED'
      | 'TIMEOUT'
      | 'ABORTED'
    >();
  });

  it('DEFAULT_PRIVATE_QUOTA_BYTES is a number constant', () => {
    expectTypeOf(DEFAULT_PRIVATE_QUOTA_BYTES).toEqualTypeOf<number>();
  });

  it('BrowserName is the exact closed union', () => {
    expectTypeOf<BrowserName>().toEqualTypeOf<
      | 'chromium'
      | 'firefox'
      | 'safari'
      | 'webkit'
      | 'edge-legacy'
      | 'ie'
      | 'unknown'
    >();
  });
});
