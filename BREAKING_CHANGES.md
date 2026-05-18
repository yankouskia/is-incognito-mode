# Breaking Changes — v2.0.0

The default export is **behaviour-compatible** with v1 for the common case
(`await isIncognito()` returns `Promise<boolean>`). Everything else may have
moved.

---

## 1. Detection technique replaced

**What changed.** v1 detected private mode by probing the FileSystem API
(Chrome/Opera), IndexedDB errors (Firefox), `localStorage`/`openDatabase`
exceptions (Safari), and `PointerEvent` heuristics (IE/Edge legacy). Every one
of these vectors was patched by browser vendors between 2019 and 2023, so v1
returns `false` in practically every browser today.

v2 uses `navigator.storage.estimate().quota` thresholds plus per-engine
fallbacks. This is the same technique used by `detectIncognito.js` and is the
current state-of-the-art signal.

**Migration.**

```ts
// v1 — happened to "work" only on legacy browsers
import isIncognito from 'is-incognito-mode';
const incognito = await isIncognito();

// v2 — same call, accurate result on modern browsers
import { isIncognito } from 'is-incognito-mode';
const incognito = await isIncognito();
```

The default export still exists for drop-in compatibility:

```ts
import isIncognito from 'is-incognito-mode'; // still works
```

---

## 2. UMD bundle removed

**What changed.** v1 shipped `dist/isIncognito.js` as a UMD bundle that exposed
itself on `window.isIncognito`. v2 ships dual ESM + CJS only.

**Migration.**

- Bundler users (Webpack, Vite, Rollup, Rspack, esbuild, Parcel): nothing to do —
  the new `exports` map resolves correctly.
- `<script>` tag users: load the ESM build from a CDN.

  ```html
  <script type="module">
    import { isIncognito } from 'https://esm.sh/is-incognito-mode@2';
    const incognito = await isIncognito();
  </script>
  ```

---

## 3. Engines bumped to Node ≥ 20

**What changed.** v1 had no `engines` field. v2 declares `"engines": { "node": ">=20.0.0" }`.

**Migration.** Upgrade Node — older LTS lines (16, 18) are end-of-life. The
library itself only runs in browsers; the engines field constrains build/test
environments for contributors and publish-time consumers using Node-side
toolchains.

---

## 4. Named exports

**What changed.** v2 adds named exports:

```ts
import {
  isIncognito,
  detectIncognito,
  IncognitoDetectionError,
} from 'is-incognito-mode';

const { isPrivate, browser, confidence, quota } = await detectIncognito();
```

`detectIncognito()` returns a richer result; `isIncognito()` is a thin wrapper
that resolves to `result.isPrivate`. `IncognitoDetectionError` is the typed
error thrown when detection is impossible.

**Migration.** Additive only. Existing default-export usage is unchanged.

---

## 5. Error shape

**What changed.** v1 rejected with a generic `Error` whose message was
`"Cannot identify whether incognito mode is active"`. v2 rejects with
`IncognitoDetectionError` (subclass of `Error`) carrying a `code` property:

```ts
import { IncognitoDetectionError } from 'is-incognito-mode';

try {
  await isIncognito();
} catch (e) {
  if (e instanceof IncognitoDetectionError) {
    console.warn(e.code); // 'NOT_A_BROWSER' | 'UNSUPPORTED_BROWSER' | 'PROBE_FAILED'
  }
}
```

**Migration.** Catch `IncognitoDetectionError` for richer info. Plain
`catch (e) { console.warn(e.message); }` still works.

---

## 6. Build output paths

**What changed.** `main` was `./dist/isIncognito.js` (UMD). v2 uses the
`exports` map; the legacy `main`/`module`/`types` fields are still set for
older bundlers but point to the new files.

**Migration.** Bundlers that respect `exports` need nothing. Anything that
hard-coded the `dist/isIncognito.js` path needs to switch to the entry point
(`import 'is-incognito-mode'`).
