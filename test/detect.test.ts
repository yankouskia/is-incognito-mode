import { describe, expect, it } from 'vitest';

import { detectIncognito, isIncognito } from '../src/detect.ts';
import { IncognitoDetectionError } from '../src/errors.ts';

import { NORMAL_HEADROOM, PRIVATE_HEADROOM, buildGlobals } from './helpers.ts';

const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;

describe('detectIncognito — Chromium quota-headroom strategy', () => {
  it('classifies a Chrome 147+ incognito tab (9 GiB headroom) as private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: PRIVATE_HEADROOM, usage: 0 },
      }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'chromium',
      confidence: 'high',
      strategy: 'chromium-quota',
      quota: PRIVATE_HEADROOM,
    });
  });

  it('classifies a Chrome 147+ normal tab (10 GiB headroom) as not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: NORMAL_HEADROOM, usage: 0 },
      }),
    });
    expect(result).toMatchObject({
      isPrivate: false,
      browser: 'chromium',
      confidence: 'high',
      strategy: 'chromium-quota',
    });
  });

  it('subtracts usage: incognito headroom holds at 9 GiB under load', async () => {
    // Chrome reports quota = usage + 9 GiB in incognito, so a tab that has
    // already written 500 MiB reports quota 9.5 GiB — headroom still 9 GiB.
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: 9 * GiB + 500 * MiB, usage: 500 * MiB },
      }),
    });
    expect(result.isPrivate).toBe(true);
  });

  it('subtracts usage: normal headroom holds at 10 GiB under load', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: 10 * GiB + 500 * MiB, usage: 500 * MiB },
      }),
    });
    expect(result.isPrivate).toBe(false);
  });

  it('classifies a legacy small incognito quota (< 147) as private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: 120 * MiB, usage: 0 },
      }),
    });
    expect(result.isPrivate).toBe(true);
  });

  it('classifies a legacy disk-bound normal quota (< 147) as not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: 200 * GiB, usage: 0 },
      }),
    });
    expect(result.isPrivate).toBe(false);
  });

  it('treats a missing usage field as zero', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: PRIVATE_HEADROOM },
      }),
    });
    expect(result.isPrivate).toBe(true);
  });

  it('honors an explicit privateQuotaThresholdBytes override', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: PRIVATE_HEADROOM, usage: 0 },
      }),
      privateQuotaThresholdBytes: 1 * GiB,
    });
    expect(result.isPrivate).toBe(false);
  });

  it('throws PROBE_FAILED when estimate() rejects', async () => {
    await expect(
      detectIncognito({
        globals: buildGlobals('chromium', { estimateRejects: true }),
      }),
    ).rejects.toMatchObject({ code: 'PROBE_FAILED' });
  });

  it('throws PROBE_FAILED when estimate() reports no quota', async () => {
    await expect(
      detectIncognito({
        globals: buildGlobals('chromium', { estimate: {} }),
      }),
    ).rejects.toMatchObject({ code: 'PROBE_FAILED' });
  });

  it('throws PROBE_FAILED when navigator.storage is unavailable', async () => {
    await expect(
      detectIncognito({
        globals: buildGlobals('chromium', { storage: 'missing' }),
      }),
    ).rejects.toMatchObject({ code: 'PROBE_FAILED' });
  });
});

describe('detectIncognito — OPFS probe (Firefox / Safari)', () => {
  it('Firefox: getDirectory rejects with a security error → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', { opfs: 'private' }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'firefox',
      confidence: 'high',
      strategy: 'opfs-probe',
    });
  });

  it('Firefox: getDirectory resolves → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', { opfs: 'normal' }),
    });
    expect(result).toMatchObject({
      isPrivate: false,
      browser: 'firefox',
      strategy: 'opfs-probe',
    });
  });

  it('Safari: getDirectory rejects "unknown transient reason" → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', { opfs: 'private' }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'safari',
      confidence: 'high',
      strategy: 'opfs-probe',
    });
  });

  it('Safari: getDirectory resolves → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', { opfs: 'normal' }),
    });
    expect(result.isPrivate).toBe(false);
    expect(result.strategy).toBe('opfs-probe');
  });

  it('an unrelated rejection is not treated as private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', { opfs: 'other-error' }),
    });
    expect(result.isPrivate).toBe(false);
  });
});

describe('detectIncognito — legacy fallbacks', () => {
  it('Safari without OPFS: localStorage throws → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', { localStorage: 'throws' }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'safari',
      strategy: 'safari-storage',
    });
  });

  it('Safari without OPFS: openDatabase throws → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', {
        localStorage: 'works',
        openDatabase: 'throws',
      }),
    });
    expect(result.isPrivate).toBe(true);
    expect(result.strategy).toBe('safari-storage');
  });

  it('Safari without OPFS: both storage probes ok → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', {
        localStorage: 'works',
        openDatabase: 'works',
      }),
    });
    expect(result.isPrivate).toBe(false);
  });

  it('Safari without OPFS: no localStorage → private (low confidence)', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('safari', { localStorage: 'missing' }),
    });
    expect(result.isPrivate).toBe(true);
    expect(result.confidence).toBe('low');
  });

  it('Firefox without OPFS: indexedDB.open errors → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', { indexedDB: 'throws' }),
    });
    expect(result).toMatchObject({
      isPrivate: true,
      browser: 'firefox',
      strategy: 'firefox-indexeddb',
    });
  });

  it('Firefox without OPFS: indexedDB.open succeeds → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', { indexedDB: 'works' }),
    });
    expect(result.isPrivate).toBe(false);
    expect(result.strategy).toBe('firefox-indexeddb');
  });

  it('Firefox without OPFS: indexedDB missing → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('firefox', { indexedDB: 'missing' }),
    });
    expect(result.isPrivate).toBe(true);
  });

  it('Firefox: indexedDB.open() throws synchronously → private', async () => {
    await expect(
      detectIncognito({
        globals: {
          navigator: { userAgent: 'Mozilla/5.0 Firefox/133.0' },
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

  it('legacy Edge: no indexedDB + PointerEvent → private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('edgeLegacy', {
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

  it('legacy Edge: indexedDB present → not private', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('edgeLegacy', {
        indexedDB: 'works',
        hasPointerEvent: true,
      }),
    });
    expect(result.isPrivate).toBe(false);
  });

  it('legacy Edge: no window at all → PROBE_FAILED', async () => {
    await expect(
      detectIncognito({
        globals: { navigator: { userAgent: 'Mozilla/5.0 MSIE 11.0' } },
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

  it('throws UNSUPPORTED_BROWSER for an unrecognized UA', async () => {
    await expect(
      detectIncognito({
        globals: {
          navigator: { userAgent: 'curl/8.4.0', vendor: '' },
          window: {},
        },
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_BROWSER' });
  });
});

describe('isIncognito', () => {
  it('returns just the boolean', async () => {
    const value = await isIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: PRIVATE_HEADROOM, usage: 0 },
      }),
    });
    expect(value).toBe(true);
  });

  it('forwards options', async () => {
    const value = await isIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: PRIVATE_HEADROOM, usage: 0 },
      }),
      privateQuotaThresholdBytes: 1 * GiB,
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
