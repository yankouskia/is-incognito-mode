import { bench, describe } from 'vitest';

import { detectBrowser } from '../src/browser.ts';
import { detectIncognito } from '../src/detect.ts';

import { NORMAL_TEMP_QUOTA, buildGlobals } from './helpers.ts';

describe('detectBrowser', () => {
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  bench('chrome desktop UA', () => {
    detectBrowser({ userAgent: ua });
  });
});

describe('detectIncognito (mocked globals)', () => {
  const globals = buildGlobals('chromium', { tempQuota: NORMAL_TEMP_QUOTA });

  bench('chromium normal quota', async () => {
    await detectIncognito({ globals });
  });
});
