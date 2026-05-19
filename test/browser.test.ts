import { describe, expect, it } from 'vitest';

import { detectBrowser } from '../src/browser.ts';

describe('detectBrowser', () => {
  it.each([
    [
      'chrome',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      'chromium',
    ],
    [
      'edge (chromium)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      'chromium',
    ],
    [
      'opera',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
      'chromium',
    ],
    [
      'chrome on ios',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS/131.0',
      'chromium',
    ],
    [
      'firefox desktop',
      'Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/133.0',
      'firefox',
    ],
    [
      'firefox ios',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) FxiOS/132.0',
      'firefox',
    ],
    [
      'safari',
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15',
      'safari',
    ],
    [
      'edge legacy',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/64.0 Safari/537.36 Edge/18.0',
      'edge-legacy',
    ],
    ['ie11', 'Mozilla/5.0 (compatible; MSIE 11.0; Windows NT 10.0)', 'ie'],
    ['ie10 trident', 'Mozilla/5.0 (compatible; Trident/6.0)', 'ie'],
    [
      'webkit shell',
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 MyShell/1.0',
      'webkit',
    ],
    ['empty', '', 'unknown'],
    ['random string', 'curl/8.0', 'unknown'],
  ])('classifies %s as %s', (_label, ua, expected) => {
    expect(detectBrowser({ userAgent: ua })).toBe(expected);
  });

  it('falls back to webkit when vendor is non-Apple but UA mentions Safari', () => {
    expect(
      detectBrowser({
        userAgent: 'Mozilla/5.0 AppleWebKit/605 Safari/605',
        vendor: 'Acme Corp',
      }),
    ).toBe('webkit');
  });

  it('detects safari when vendor is missing', () => {
    expect(
      detectBrowser({
        userAgent: 'Mozilla/5.0 AppleWebKit/605 Safari/605',
      }),
    ).toBe('safari');
  });
});
