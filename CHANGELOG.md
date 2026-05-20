# Changelog

## 2.2.0

### Minor Changes

- Detect Chrome 147+ incognito via storage-quota **headroom** — empirically verified against Chrome 148.

  **Why v2.0/v2.1 failed.** Chromium 147 made the `predictable-reported-quota`
  mitigation default. v2.0 thresholded `estimate().quota` directly; v2.1 switched
  to `webkitTemporaryStorage` vs `performance.memory.jsHeapSizeLimit` (the
  technique `detectIncognito` uses). Both miss modern Chrome — `detectIncognito`
  itself now declares Chromium 147+ "broken".

  **What actually works.** Driving headless Chrome 148 (normal vs. real
  `--incognito`) shows the mitigation did **not** fully equalize the modes:
  - Normal tab: `navigator.storage.estimate()` → `quota = usage + 10 GiB`
  - Incognito tab: `quota = usage + 9 GiB`

  The **headroom** (`quota − usage`) is a rock-solid `10 GiB` vs `9 GiB` — stable
  even after writing data, because subtracting `usage` cancels real consumption.
  The Chromium strategy now classifies a tab as private when its headroom is
  below **9.5 GiB** (the midpoint). Verified: Chrome 148 normal → `isPrivate:false`,
  Chrome 148 incognito → `isPrivate:true`. The same cutoff also catches pre-147
  Chromium (small dynamic incognito quota).

  **API changes (runtime API unchanged):**
  - `isIncognito()`, `detectIncognito()`, `DetectionResult`,
    `IncognitoDetectionError`, and the `DetectionStrategyName` values are all
    unchanged.
  - The Chromium strategy no longer reads `navigator.webkitTemporaryStorage` or
    `performance.memory`; it uses only the standard `navigator.storage.estimate()`.
  - Removed the v2.1.0-only exported types `DeprecatedStorageQuota` and
    `PerformanceLike`, and the corresponding optional fields on `NavigatorLike` /
    `WindowLike` (they were one release old and only relevant to the dropped
    technique).
  - `DEFAULT_PRIVATE_QUOTA_BYTES` is now `9.5 GiB` — the headroom cutoff.
    `privateQuotaThresholdBytes` overrides it.

  The live demo's diagnostics panel now shows `quota`, `usage`, and the computed
  headroom.

## 2.1.0

### Minor Changes

- Robust per-engine detection — fixes Chrome incognito false negatives for good.

  **The problem.** Chrome now deliberately fakes `navigator.storage.estimate().quota`
  at `usage + 10 GiB` in _every_ mode, specifically to defeat incognito detection.
  Any threshold on that value — 120 MiB, 1 GiB, anything — is therefore unreliable
  on modern Chrome.

  **The fix.** Detection is now per-engine, using the signal that actually still
  leaks for each:
  - **Chromium** — reads the legacy `navigator.webkitTemporaryStorage` quota
    (which is _not_ faked) and compares it to `performance.memory.jsHeapSizeLimit`.
    An incognito quota is memory-bound and stays below ~2× the heap limit; a
    normal quota is disk-bound and far above it. The test is device-relative, so
    there is no brittle fixed byte count.
  - **Firefox & Safari** — probes the Origin Private File System via
    `navigator.storage.getDirectory()`, which is rejected in private mode
    (Firefox: a security error; Safari: "unknown transient reason").
  - **Legacy Edge / IE** — unchanged `PointerEvent` + `indexedDB` heuristic.
  - Legacy `localStorage` / `indexedDB.open` probes are retained as fallbacks for
    older Safari and Firefox without OPFS.

  **API changes (all backward compatible at runtime):**
  - `isIncognito()`, `detectIncognito()`, `DetectionResult`, and
    `IncognitoDetectionError` are unchanged.
  - `DetectionResult.strategy` values changed: new `chromium-quota` and
    `opfs-probe`; `storage-quota` removed. The `strategy` field is informational
    (debugging / analytics); switch on it accordingly.
  - New exported types: `PerformanceLike`, `DeprecatedStorageQuota`.
  - `NavigatorLike` / `WindowLike` / `StorageManagerLike` gained optional fields
    (`webkitTemporaryStorage`, `performance`, `getDirectory`).
  - `DEFAULT_PRIVATE_QUOTA_BYTES` (1 GiB) is retained as the fallback heap limit
    used when `performance.memory` is unavailable.
  - `privateQuotaThresholdBytes`, when set, still forces an absolute byte cutoff
    for the Chromium strategy.

  Reference: this mirrors the techniques in the actively-maintained
  `detectIncognito` library (v1.6.2).

## 2.0.2

### Patch Changes

- Fix: Chrome incognito false negative — raise default quota threshold from 120 MiB to 1 GiB.

  Chrome 110+ raised the per-tab incognito storage ceiling: a private tab on a
  desktop commonly reports `navigator.storage.estimate().quota` in the
  500 MiB–1 GiB range. With the previous 120 MiB cutoff, every modern Chromium
  incognito session was misclassified as normal.

  `DEFAULT_PRIVATE_QUOTA_BYTES` is now `1024 × 1024 × 1024` (1 GiB), matching the
  threshold used by the actively-maintained `detectIncognito` library and
  covering Chromium, Firefox, and Safari private modes. Normal-mode quotas on
  modern desktops are tens-to-hundreds of GiB so the safety margin is large.

  A regression test pins the behaviour at a 800 MiB quota (the heart of the
  modern Chromium incognito band).

  If you previously depended on the 120 MiB cutoff, pass
  `privateQuotaThresholdBytes: 120 * 1024 * 1024` to `detectIncognito()` to
  restore the old behaviour.

## 2.0.1

### Patch Changes

- Docs and housekeeping pass following the v2.0.0 release.
  - README leads with a 30-second tour before the "why" section so readers see
    action first; the detection-flow Mermaid diagram is collapsible; use-cases
    promoted to a scenario table; fixed a stale code-sample strategy name
    (`storage-quota`, not `storage-estimate`).
  - Removed unused `detectCurrentBrowser()` export (no production caller) and
    the corresponding test. Only `detectBrowser()` taking explicit args is used.
  - Removed the never-returned `'unknown'` member from `DetectionStrategyName`.
  - `.gitignore` adds `.claude/`.

## 2.0.0

### Major Changes

- 11770a6: ## v2.0.0 — complete modernization

  The detection vectors used by v1 (FileSystem API, IndexedDB error, localStorage
  exception, PointerEvent heuristics) have all been patched out of mainline
  browsers since 2019. v2 replaces them with `navigator.storage.estimate()` quota
  thresholding, which is the current state-of-the-art technique and works across
  Chromium, Firefox, and WebKit.

  Other changes:
  - Source rewritten in strict TypeScript. Full `.d.ts` ship.
  - Dual ESM + CJS publish with a proper `exports` map. UMD bundle removed.
  - New named exports: `detectIncognito()` (rich result), `IncognitoDetectionError`
    (typed errors with `code`), `DEFAULT_PRIVATE_QUOTA_BYTES`.
  - The default export is preserved for v1 drop-in compatibility.
  - Zero runtime dependencies (was: `get-browser`).
  - `engines.node >= 20`.

  See `BREAKING_CHANGES.md` for migration recipes.

All notable changes to this project are documented in this file. From v2.0.0
onward, entries are generated by [Changesets](https://github.com/changesets/changesets);
historical pre-v2 entries are preserved as-is.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [2.0.0] — Unreleased

> Generated from the pending changeset at release time. See
> `BREAKING_CHANGES.md` for migration recipes.

### Added

- `detectIncognito()` returning a rich `DetectionResult` (browser, confidence,
  quota, strategy).
- `IncognitoDetectionError` with stable `code` literal-union (`NOT_A_BROWSER`
  / `UNSUPPORTED_BROWSER` / `PROBE_FAILED`).
- `DEFAULT_PRIVATE_QUOTA_BYTES` and a `privateQuotaThresholdBytes` option for
  tuning the detector.
- TypeScript types ship with the package.
- Dual ESM + CJS publish; `exports` map; npm provenance.

### Changed

- **Detection technique** rewritten around `navigator.storage.estimate()` quota
  probing. The v1 vectors (FileSystem API, IndexedDB error path, localStorage
  exception, PointerEvent heuristics) were patched by browser vendors between
  2019 and 2023 and were returning incorrect results in current browsers.
- Build chain replaced (Webpack 4 / Babel 7 → tsup / esbuild).
- Package manager pinned to pnpm via `packageManager`.
- `engines.node` bumped to `>= 20`.

### Removed

- UMD bundle (`dist/isIncognito.js`). Use the ESM build via a CDN for direct
  `<script>` usage.
- The `get-browser` runtime dependency (zero deps now).

---

## [1.1.0] — 2019

- Update Firefox detection to fire callback correctly.
- Update `get-browser` to correctly identify Chromium.

## [1.0.0] — 2019

- Initial public release.
