---
'is-incognito-mode': minor
---

Add opt-in verdict caching: `detectIncognito()` / `isIncognito()` accept `cache?: boolean`.

Private / incognito state can't change within a page load, so `cache: true` memoizes the **first successful** `DetectionResult` and returns it instantly on later calls — skipping the storage probes. The cache is a `WeakMap` keyed by the live `navigator` object, so it lives exactly as long as the page (per-document, per-origin) and needs no teardown; injected `globals` (tests, per-request SSR) get an isolated cache automatically.

Only successful verdicts are cached — `TIMEOUT` / `ABORTED` / `PROBE_FAILED` rejections are never stored, so a later call retries cleanly. Off by default; the no-options path is unchanged. ~40 B min+gzip, zero new dependencies. See ADR-010.
