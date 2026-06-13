import { describe, expect, it, vi } from 'vitest';

import { detectIncognito } from '../src/detect.ts';

import { NORMAL_HEADROOM, PRIVATE_HEADROOM } from './helpers.ts';

const GiB = 1024 * 1024 * 1024;

/**
 * Build a Chromium globals object whose `estimate()` is a spy, so tests can
 * assert how many times the probe actually ran.
 */
function chromiumWithSpy(quota: number) {
  const estimate = vi.fn(() => Promise.resolve({ quota, usage: 0 }));
  const globals = {
    navigator: {
      userAgent: 'Mozilla/5.0 ... Chrome/148.0',
      vendor: 'Google Inc.',
      storage: { estimate },
    },
    window: {},
  };
  return { globals, estimate };
}

describe('detectIncognito — cache', () => {
  it('memoizes the verdict: the probe runs once across repeated cache:true calls', async () => {
    const { globals, estimate } = chromiumWithSpy(PRIVATE_HEADROOM);

    const first = await detectIncognito({ globals, cache: true });
    const second = await detectIncognito({ globals, cache: true });

    expect(first.isPrivate).toBe(true);
    expect(second).toBe(first); // same cached object reference
    expect(estimate).toHaveBeenCalledTimes(1);
  });

  it('does not cache when cache is false / omitted (probe runs every call)', async () => {
    const { globals, estimate } = chromiumWithSpy(PRIVATE_HEADROOM);

    await detectIncognito({ globals });
    await detectIncognito({ globals, cache: false });
    await detectIncognito({ globals });

    expect(estimate).toHaveBeenCalledTimes(3);
  });

  it('a non-cache call after a cached one still re-probes (read-through only on cache:true)', async () => {
    const { globals, estimate } = chromiumWithSpy(PRIVATE_HEADROOM);

    await detectIncognito({ globals, cache: true }); // probes + fills cache
    await detectIncognito({ globals }); // cache:false → re-probes

    expect(estimate).toHaveBeenCalledTimes(2);
  });

  it('isolates caches per navigator: different globals do not share entries', async () => {
    const a = chromiumWithSpy(PRIVATE_HEADROOM);
    const b = chromiumWithSpy(NORMAL_HEADROOM);

    const ra = await detectIncognito({ globals: a.globals, cache: true });
    const rb = await detectIncognito({ globals: b.globals, cache: true });

    expect(ra.isPrivate).toBe(true);
    expect(rb.isPrivate).toBe(false);
    expect(a.estimate).toHaveBeenCalledTimes(1);
    expect(b.estimate).toHaveBeenCalledTimes(1);
  });

  it('does not cache rejections — a later call retries cleanly', async () => {
    // First call: estimate stalls and we time out (TIMEOUT must not be cached).
    // Second call: estimate resolves, yielding a real verdict.
    let calls = 0;
    const estimate = vi.fn(() => {
      calls += 1;
      return calls === 1
        ? new Promise<{ quota: number }>(() => {}) // hang → TIMEOUT
        : Promise.resolve({ quota: PRIVATE_HEADROOM, usage: 0 });
    });
    const globals = {
      navigator: {
        userAgent: 'Mozilla/5.0 ... Chrome/148.0',
        vendor: 'Google Inc.',
        storage: { estimate },
      },
      window: {},
    };

    await expect(
      detectIncognito({ globals, cache: true, timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });

    const retry = await detectIncognito({ globals, cache: true });
    expect(retry.isPrivate).toBe(true);
    expect(estimate).toHaveBeenCalledTimes(2);
  });

  it('concurrent cache:true calls both resolve to an equivalent verdict', async () => {
    const { globals, estimate } = chromiumWithSpy(PRIVATE_HEADROOM);

    const [a, b] = await Promise.all([
      detectIncognito({ globals, cache: true }),
      detectIncognito({ globals, cache: true }),
    ]);

    expect(a.isPrivate).toBe(true);
    expect(b.isPrivate).toBe(true);
    // Both run their synchronous prelude (incl. the cache read) before either
    // resolves, so both miss and probe exactly once each.
    expect(estimate).toHaveBeenCalledTimes(2);

    // The cache is now warm, so a third call probes zero more times.
    const third = await detectIncognito({ globals, cache: true });
    expect(third.isPrivate).toBe(true);
    expect(estimate).toHaveBeenCalledTimes(2);
  });

  it('does not cache an ABORTED rejection — a later call retries cleanly', async () => {
    let calls = 0;
    const estimate = vi.fn(() => {
      calls += 1;
      return calls === 1
        ? new Promise<{ quota: number }>(() => {}) // hang → gets aborted
        : Promise.resolve({ quota: PRIVATE_HEADROOM, usage: 0 });
    });
    const globals = {
      navigator: {
        userAgent: 'Mozilla/5.0 ... Chrome/148.0',
        vendor: 'Google Inc.',
        storage: { estimate },
      },
      window: {},
    };

    const controller = new AbortController();
    const aborted = detectIncognito({
      globals,
      cache: true,
      signal: controller.signal,
    });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: 'ABORTED' });

    const retry = await detectIncognito({ globals, cache: true });
    expect(retry.isPrivate).toBe(true);
    expect(estimate).toHaveBeenCalledTimes(2);
  });

  it('a cache hit ignores a later differing timeoutMs (returns instantly)', async () => {
    let calls = 0;
    const estimate = vi.fn(() => {
      calls += 1;
      return calls === 1
        ? Promise.resolve({ quota: PRIVATE_HEADROOM, usage: 0 })
        : new Promise<{ quota: number }>(() => {}); // would hang if re-probed
    });
    const globals = {
      navigator: {
        userAgent: 'Mozilla/5.0 ... Chrome/148.0',
        vendor: 'Google Inc.',
        storage: { estimate },
      },
      window: {},
    };

    const first = await detectIncognito({ globals, cache: true });
    // A re-probe here would hang and trip the 1 ms deadline; the cache hit must
    // short-circuit before the timeout machinery, returning the original result.
    const second = await detectIncognito({
      globals,
      cache: true,
      timeoutMs: 1,
    });

    expect(second).toBe(first);
    expect(estimate).toHaveBeenCalledTimes(1);
  });

  it('documented footgun: a cache hit ignores a later differing threshold', async () => {
    const { globals, estimate } = chromiumWithSpy(PRIVATE_HEADROOM);

    // First: default 9.5 GiB threshold → 9 GiB headroom is private.
    const first = await detectIncognito({ globals, cache: true });
    expect(first.isPrivate).toBe(true);

    // Second: a 1 GiB threshold would normally flip the verdict to not-private,
    // but the cached result is returned and the threshold is ignored.
    const second = await detectIncognito({
      globals,
      cache: true,
      privateQuotaThresholdBytes: 1 * GiB,
    });
    expect(second.isPrivate).toBe(true);
    expect(second).toBe(first);
    expect(estimate).toHaveBeenCalledTimes(1);
  });
});
