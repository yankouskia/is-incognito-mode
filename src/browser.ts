/**
 * Coarse browser-engine identifiers used to pick a detection strategy.
 *
 * We deliberately do not export brand names like "Brave" or "Vivaldi" — they
 * are all Chromium under the hood and the relevant private-mode behaviour
 * matches the engine, not the brand.
 */
export type BrowserName =
  | 'chromium'
  | 'firefox'
  | 'safari'
  | 'webkit'
  | 'edge-legacy'
  | 'ie'
  | 'unknown';

interface UserAgentSource {
  readonly userAgent: string;
  readonly vendor?: string;
}

const CHROMIUM_HINTS = ['chrome/', 'crios/', 'chromium/', 'edg/', 'opr/'];

/**
 * Classify the current navigator into a coarse browser engine.
 *
 * Pure function — accepts an optional `source` so it can be unit-tested
 * without polluting globals. In production we read from `navigator` directly.
 */
export function detectBrowser(source?: UserAgentSource): BrowserName {
  const ua = (source?.userAgent ?? '').toLowerCase();
  const vendor = (source?.vendor ?? '').toLowerCase();

  if (!ua) return 'unknown';

  if (ua.includes('msie ') || ua.includes('trident/')) return 'ie';
  if (ua.includes('edge/')) return 'edge-legacy';
  if (ua.includes('firefox/') || ua.includes('fxios/')) return 'firefox';

  const looksLikeChromium = CHROMIUM_HINTS.some((hint) => ua.includes(hint));
  if (looksLikeChromium) return 'chromium';

  // Safari sets `vendor === 'apple computer, inc.'`. iOS-Chrome/Firefox also
  // run on WebKit but advertise different UAs, so we reach this branch only
  // for "real" Safari and other WebKit shells.
  if (ua.includes('safari/') && (vendor.includes('apple') || !vendor)) {
    return 'safari';
  }
  if (ua.includes('applewebkit/')) return 'webkit';

  return 'unknown';
}
