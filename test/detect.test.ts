import { describe, expect, it } from 'vitest';

import { detectIncognito, isIncognito } from '../src/detect.ts';
import { IncognitoDetectionError } from '../src/errors.ts';

import { NORMAL_QUOTA, PRIVATE_QUOTA, buildGlobals } from './helpers.ts';

describe('detectIncognito — storage-quota strategy', () => {
  it('returns isPrivate=true for Chromium with small quota', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', { quota: PRIVATE_QUOTA }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'chromium',
      confidence: 'high',
      strategy: 'storage-quota',
      quota: PRIVATE_QUOTA,
    });
  });

  it('returns isPrivate=true for modern-Chromium incognito quota (~800 MiB)', async () => {
    // Chrome 110+ raised the incognito ceiling; on a desktop a private tab
    // commonly reports quota in the 500 MiB–1 GiB band. This regression test
    // pins our threshold to the band where modern Chromium incognito lives.
    const modernIncognitoQuota = 800 * 1024 * 1024;
    const result = await detectIncognito({
      globals: buildGlobals('chromium', { quota: modernIncognitoQuota }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'chromium',
      confidence: 'high',
      strategy: 'storage-quota',
      quota: modernIncognitoQuota,
    });
  });

  it('returns isPrivate=false for Chromium with normal quota', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', { quota: NORMAL_QUOTA }),
    });
    expect(result).toMatchObject({
      isPrivate: false,
      browser: 'chromium',
      confidence: 'high',
      strategy: 'storage-quota',
    });
  });

  it('honors a custom threshold', async () => {
    const customLow = 1024 * 1024 * 50; // 50 MiB
    const result = await detectIncognito({
      globals: buildGlobals('chromium', { quota: 80 * 1024 * 1024 }),
      privateQuotaThresholdBytes: customLow,
    });
    expect(result.isPrivate).toBe(false);
  });

  it('reports quota field even when classified as normal', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', { quota: NORMAL_QUOTA }),
    });
    expect(result.quota).toBe(NORMAL_QUOTA);
  });

  it('reports browser=safari for a Safari UA', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', { quota: PRIVATE_QUOTA }),
    });
    expect(result.browser).toBe('safari');
  });
});

describe('detectIncognito — fallback strategies', () => {
  it('safari fallback: localStorage throws → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', {
        storage: 'missing',
        localStorage: 'throws',
      }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'safari',
      strategy: 'safari-storage',
    });
  });

  it('safari fallback: openDatabase throws → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', {
        storage: 'missing',
        localStorage: 'works',
        openDatabase: 'throws',
      }),
    });
    expect(result.isPrivate).toBe(true);
    expect(result.strategy).toBe('safari-storage');
  });

  it('safari fallback: both ok → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', {
        storage: 'missing',
        localStorage: 'works',
        openDatabase: 'works',
      }),
    });
    expect(result.isPrivate).toBe(false);
  });

  it('safari fallback: no localStorage at all → private (low confidence)', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', {
        storage: 'missing',
        localStorage: 'missing',
      }),
    });
    expect(result.isPrivate).toBe(true);
    expect(result.confidence).toBe('low');
  });

  it('firefox fallback: indexedDB.open errors → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', {
        storage: 'missing',
        indexedDB: 'throws',
      }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'firefox',
      strategy: 'firefox-indexeddb',
    });
  });

  it('firefox fallback: indexedDB.open succeeds → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', {
        storage: 'missing',
        indexedDB: 'works',
      }),
    });
    expect(result.isPrivate).toBe(false);
    expect(result.strategy).toBe('firefox-indexeddb');
  });

  it('firefox fallback: indexedDB missing → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', {
        storage: 'missing',
        indexedDB: 'missing',
      }),
    });
    expect(result.isPrivate).toBe(true);
  });

  it('legacy edge: no indexedDB + PointerEvent → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('edgeLegacy', {
        storage: 'missing',
        indexedDB: 'missing',
        hasPointerEvent: true,
      }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'edge-legacy',
      strategy: 'legacy-edge',
    });
  });

  it('legacy edge: indexedDB present → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('edgeLegacy', {
        storage: 'missing',
        indexedDB: 'works',
        hasPointerEvent: true,
      }),
    });
    expect(result.isPrivate).toBe(false);
  });

  it('firefox: indexedDB.open() itself throws synchronously → private', async () => {
    await expect(
      detectIncognito({
        globals: {
          navigator: {
            userAgent: 'Mozilla/5.0 Firefox/133.0',
          },
          window: {},
          indexedDB: {
            open: () => {
              throw new Error('SecurityError');
            },
          } as unknown as IDBFactory,
        },
      }),
    ).resolves.toMatchObject({
      isPrivate: true,
      strategy: 'firefox-indexeddb',
    });
  });

  it('legacy edge: no window at all → unsupported', async () => {
    await expect(
      detectIncognito({
        globals: {
          navigator: {
            userAgent: 'Mozilla/5.0 MSIE 11.0',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'PROBE_FAILED' });
  });
});

describe('detectIncognito — errors', () => {
  it('throws NOT_A_BROWSER when navigator is absent', async () => {
    await expect(
      detectIncognito({ globals: { navigator: undefined } }),
    ).rejects.toThrow(IncognitoDetectionError);
    await expect(
      detectIncognito({ globals: { navigator: undefined } }),
    ).rejects.toMatchObject({ code: 'NOT_A_BROWSER' });
  });

  it('throws UNSUPPORTED_BROWSER for unknown UA without storage', async () => {
    await expect(
      detectIncognito({
        globals: {
          navigator: { userAgent: 'curl/8.4.0', vendor: '' },
          window: {},
        },
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_BROWSER' });
  });

  it('throws PROBE_FAILED when storage.estimate rejects and no fallback applies', async () => {
    await expect(
      detectIncognito({
        globals: {
          navigator: {
            userAgent: 'Mozilla/5.0 Chrome/131.0',
            storage: {
              estimate: () => Promise.reject(new Error('boom')),
            },
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'PROBE_FAILED' });
  });

  it('throws PROBE_FAILED when estimate() returns no quota and no fallback', async () => {
    await expect(
      detectIncognito({
        globals: buildGlobals('chromium', { quota: undefined }),
      }),
    ).rejects.toMatchObject({ code: 'PROBE_FAILED' });
  });
});

describe('isIncognito', () => {
  it('returns just the boolean', async () => {
    const value = await isIncognito({
      globals: buildGlobals('chromium', { quota: PRIVATE_QUOTA }),
    });
    expect(value).toBe(true);
  });

  it('forwards options', async () => {
    const value = await isIncognito({
      globals: buildGlobals('chromium', { quota: 80 * 1024 * 1024 }),
      privateQuotaThresholdBytes: 50 * 1024 * 1024,
    });
    expect(value).toBe(false);
  });

  it('uses live globals when no override is passed', async () => {
    // happy-dom provides a navigator; the call should either resolve to a
    // boolean or throw an IncognitoDetectionError. Either is a valid runtime
    // outcome — the point is that resolveGlobals() reads live values without
    // crashing.
    try {
      const value = await isIncognito();
      expect(typeof value).toBe('boolean');
    } catch (error) {
      expect(error).toBeInstanceOf(IncognitoDetectionError);
    }
  });
});
