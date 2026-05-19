---
'is-incognito-mode': major
---

## v2.0.0 — complete modernization

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
