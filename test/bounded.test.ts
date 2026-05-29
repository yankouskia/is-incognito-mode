import { describe, expect, it, vi } from 'vitest';

import { detectIncognito, isIncognito } from '../src/detect.ts';
import { IncognitoDetectionError } from '../src/errors.ts';

import { PRIVATE_HEADROOM, buildGlobals } from './helpers.ts';

const FIREFOX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0';

describe('detectIncognito — timeoutMs', () => {
  it('rejects with TIMEOUT when the Chromium estimate stalls', async () => {
    const error = await detectIncognito({
      globals: buildGlobals('chromium', { estimateHangs: true }),
      timeoutMs: 10,
    }).catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(IncognitoDetectionError);
    expect(error).toMatchObject({ code: 'TIMEOUT' });
    expect((error as IncognitoDetectionError).message).toContain('10 ms');
  });

  it('rejects with TIMEOUT when the OPFS probe stalls', async () => {
    await expect(
      detectIncognito({
        globals: buildGlobals('firefox', { opfs: 'hangs' }),
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejects with TIMEOUT when the Firefox IndexedDB probe never settles', async () => {
    await expect(
      detectIncognito({
        globals: buildGlobals('firefox', { indexedDB: 'hangs' }),
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('returns the verdict when detection finishes within the deadline', async () => {
    const result = await detectIncognito({
      globals: buildGlobals('chromium', {
        estimate: { quota: PRIVATE_HEADROOM, usage: 0 },
      }),
      timeoutMs: 1000,
    });
    expect(result).toMatchObject({
      isPrivate: true,
      strategy: 'chromium-quota',
    });
  });

  it('isIncognito forwards timeoutMs', async () => {
    await expect(
      isIncognito({
        globals: buildGlobals('chromium', { estimateHangs: true }),
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('detectIncognito — signal', () => {
  it('rejects synchronously with ABORTED if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const estimate = vi.fn(() => new Promise<{ quota: number }>(() => {}));
    const globals = {
      navigator: {
        userAgent: 'Mozilla/5.0 Chrome/148.0',
        vendor: 'Google Inc.',
        storage: { estimate },
      },
      window: {},
    };

    await expect(
      detectIncognito({ globals, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    // The pre-flight check short-circuits before any probe runs.
    expect(estimate).not.toHaveBeenCalled();
  });

  it('propagates the abort reason as the error cause', async () => {
    const controller = new AbortController();
    const reason = new Error('user navigated away');
    controller.abort(reason);

    const error = await detectIncognito({
      globals: buildGlobals('chromium', { estimateHangs: true }),
      signal: controller.signal,
    }).catch((error_: unknown) => error_);

    expect(error).toMatchObject({ code: 'ABORTED', cause: reason });
  });

  it('rejects with ABORTED when aborted mid-flight', async () => {
    const controller = new AbortController();
    const promise = detectIncognito({
      globals: buildGlobals('chromium', { estimateHangs: true }),
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('detaches the IndexedDB request listeners when aborted', async () => {
    const removeEventListener = vi.fn();
    const listeners: Record<string, (() => void)[]> = {};
    const request = {
      result: { close: () => {} },
      addEventListener: (name: string, cb: () => void) => {
        (listeners[name] ??= []).push(cb);
      },
      removeEventListener,
    };
    const indexedDB = {
      open: () => request,
      deleteDatabase: () => {},
    } as unknown as IDBFactory;

    const controller = new AbortController();
    const signalRemove = vi.spyOn(controller.signal, 'removeEventListener');
    const promise = detectIncognito({
      globals: {
        navigator: { userAgent: FIREFOX_UA, vendor: '' },
        window: {},
        indexedDB,
      },
      signal: controller.signal,
    });
    // Let the OPFS probe resolve to null and the IndexedDB probe attach its
    // listeners, so the abort lands while the probe is genuinely waiting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
    // success + error request listeners and the signal listener are all
    // removed on teardown — nothing dangles.
    expect(removeEventListener).toHaveBeenCalledWith(
      'success',
      expect.any(Function),
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
    expect(signalRemove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('short-circuits the IndexedDB probe when the signal trips before it opens', async () => {
    // Firefox runs the OPFS probe (here: absent → null) before IndexedDB. An
    // abort during that gap leaves the internal signal aborted by the time the
    // IndexedDB probe starts, so it must reject without opening a request —
    // `addEventListener('abort')` would never fire on an already-aborted signal.
    const open = vi.fn();
    const indexedDB = {
      open,
      deleteDatabase: () => {},
    } as unknown as IDBFactory;

    const controller = new AbortController();
    const promise = detectIncognito({
      globals: {
        navigator: { userAgent: FIREFOX_UA, vendor: '' },
        window: {},
        indexedDB,
      },
      signal: controller.signal,
    });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('detectIncognito — timeoutMs + signal together', () => {
  it('an early abort wins over a long deadline (ABORTED)', async () => {
    const controller = new AbortController();
    const promise = detectIncognito({
      globals: buildGlobals('chromium', { estimateHangs: true }),
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('the deadline wins when the signal never fires (TIMEOUT)', async () => {
    const controller = new AbortController();
    await expect(
      detectIncognito({
        globals: buildGlobals('chromium', { estimateHangs: true }),
        timeoutMs: 10,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
