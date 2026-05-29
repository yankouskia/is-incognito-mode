---
'is-incognito-mode': minor
---

Add bounded, cancelable detection: `detectIncognito()` / `isIncognito()` now accept `timeoutMs` and an `AbortSignal` `signal`.

- `timeoutMs?: number` — reject with `IncognitoDetectionError` code `TIMEOUT` if no verdict arrives in time. Guards against a storage probe (e.g. a Firefox `indexedDB.open` that never fires `success`/`error`) freezing a critical render path.
- `signal?: AbortSignal` — cancel detection; rejects with code `ABORTED`. If the signal is already aborted, the call rejects synchronously.
- Two new `IncognitoDetectionErrorCode` members: `TIMEOUT` and `ABORTED`.

Both options are opt-in and compose (first to fire wins). The no-options path is unchanged and byte-for-byte backward compatible. When a bound trips, the in-flight probe is abandoned and its listeners detached. Zero new dependencies.
