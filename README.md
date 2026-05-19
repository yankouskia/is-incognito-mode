<div align="center">

# `is-incognito-mode`

### **Detect private / incognito browsing in 4 lines of code.**

_Zero dependencies — fully typed — dual ESM + CJS — ~1 kB gzipped._

[![npm version](https://img.shields.io/npm/v/is-incognito-mode.svg?logo=npm&color=cb3837)](https://www.npmjs.com/package/is-incognito-mode)
[![npm downloads](https://img.shields.io/npm/dm/is-incognito-mode.svg?color=cb3837)](https://www.npmjs.com/package/is-incognito-mode)
[![CI](https://github.com/yankouskia/is-incognito-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/yankouskia/is-incognito-mode/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen?logo=vitest)](./coverage)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/is-incognito-mode?label=min%2Bgzip&color=44cc11)](https://bundlephobia.com/package/is-incognito-mode)
[![Types](https://img.shields.io/npm/types/is-incognito-mode.svg?logo=typescript&color=3178c6)](./src/index.ts)
[![License](https://img.shields.io/npm/l/is-incognito-mode.svg?color=blue)](./LICENSE)

<br />

### **[Try the live demo →](https://yankouskia.github.io/is-incognito-mode/demo/)**

_Open it in a normal window. Then re-open it in private/incognito mode. Watch the verdict flip._

<br />

</div>

---

## Why this exists

Browsers don't expose a "private mode" API. They _do_, however, leak the fact
indirectly through **resource limits** and **storage shape**.

`is-incognito-mode` wraps the **current state-of-the-art detection** in a tiny,
typed, dependency-free package — so you don't have to hand-roll the heuristic
in every project, and so you stop using detection tricks that browsers patched
out years ago.

Common use cases:

- **Soft paywalls** — discourage incognito bypass without hard-blocking.
- **Analytics opt-out** signals — respect users who clearly want a clean session.
- **Surveys & auth flows** — warn before storing state that vanishes at window-close.
- **Fraud signals** — one input among many. Never the only one.

---

## How it works

The library prefers a **direct signal** when one is available, and falls back
to engine-specific heuristics for older browsers.

```mermaid
flowchart TD
    A[detectIncognito] --> B{navigator.storage<br/>.estimate available?}
    B -- yes --> C{quota &lt; 120 MiB?}
    C -- yes --> R1([private — high confidence])
    C -- no --> R2([normal — high confidence])
    B -- no --> D{which browser?}
    D -- Safari/WebKit --> E[localStorage probe<br/>+ openDatabase probe]
    D -- Firefox --> F[indexedDB.open error path]
    D -- Edge legacy / IE --> G[PointerEvent + window.indexedDB heuristic]
    D -- unknown --> X([throw UNSUPPORTED_BROWSER])
    E --> R3([private/normal — medium])
    F --> R4([private/normal — low])
    G --> R5([private/normal — low])
```

The default threshold is **120 MiB** — Chromium gives incognito tabs ~10 % of
disk capped at 120 MiB, Firefox PB caps quota similarly. Devices with very
small total storage may produce false positives; raise the threshold or
lower-bound it against `navigator.deviceMemory * 1 GiB` if that matters
to you.

---

## Install

```sh
pnpm add is-incognito-mode
# or
npm install is-incognito-mode
# or
yarn add is-incognito-mode
# or
bun add is-incognito-mode
```

**No-install via CDN**:

```html
<script type="module">
  import { isIncognito } from 'https://esm.sh/is-incognito-mode@2';
  console.log(await isIncognito());
</script>
```

---

## Quickstart

```ts
import { isIncognito } from 'is-incognito-mode';

if (await isIncognito()) {
  showPaywall();
} else {
  trackVisit();
}
```

That's it. Honestly.

---

## Live demo

A ready-to-run page that calls `detectIncognito()` and renders the result is
hosted alongside the docs:

> **https://yankouskia.github.io/is-incognito-mode/demo/**

The source lives at [`examples/browser/index.html`](./examples/browser/index.html)
— it's a single static file. No bundler, no build step.

Open it once in a regular window, then once in incognito/private. The
**verdict, browser, confidence, quota, and strategy** all update live.

---

## Usage

### Boolean verdict

```ts
import { isIncognito } from 'is-incognito-mode';

const inPrivate = await isIncognito();
```

### Rich detection result

```ts
import { detectIncognito } from 'is-incognito-mode';

const { isPrivate, browser, confidence, quota, strategy } =
  await detectIncognito();

console.log(
  `${browser} (${confidence}) — strategy: ${strategy}, quota: ${quota}`,
);
// → "chromium (high) — strategy: storage-estimate, quota: 33554432"
```

Fields on `DetectionResult`:

| field        | type                          | notes                                                                                     |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `isPrivate`  | `boolean`                     | Final verdict.                                                                            |
| `browser`    | `BrowserName`                 | Coarse engine: `chromium`, `firefox`, `safari`, `webkit`, `edge-legacy`, `ie`, `unknown`. |
| `confidence` | `'high' \| 'medium' \| 'low'` | `high` for direct quota signal; `low` for legacy heuristics.                              |
| `quota`      | `number \| null`              | Total storage quota in bytes, when `storage.estimate()` was available.                    |
| `strategy`   | `DetectionStrategyName`       | Which probe produced the verdict.                                                         |

### Tuning the quota threshold

```ts
import {
  detectIncognito,
  DEFAULT_PRIVATE_QUOTA_BYTES,
} from 'is-incognito-mode';

const result = await detectIncognito({
  privateQuotaThresholdBytes: DEFAULT_PRIVATE_QUOTA_BYTES * 2,
});
```

Default is **120 MiB**. Raise it if you see false positives on small-disk
devices.

### Injecting globals (for testing)

`detectIncognito` accepts a `globals` override so unit tests don't have to
monkey-patch `navigator` or `window`:

```ts
import { detectIncognito } from 'is-incognito-mode';

const result = await detectIncognito({
  globals: {
    navigator: {
      userAgent: 'Mozilla/5.0 ... Chrome/131.0',
      storage: {
        estimate: () => Promise.resolve({ quota: 32 * 1024 * 1024 }),
      },
    },
    window: {},
  },
});
// result.isPrivate === true
```

### Error handling

```ts
import { isIncognito, IncognitoDetectionError } from 'is-incognito-mode';

try {
  const incognito = await isIncognito();
  // ...
} catch (error) {
  if (error instanceof IncognitoDetectionError) {
    switch (error.code) {
      case 'NOT_A_BROWSER':
        // Server-side render path
        break;
      case 'UNSUPPORTED_BROWSER':
        // Probably a bot / curl / node-fetch
        break;
      case 'PROBE_FAILED':
        // Storage API rejected, no fallback applied
        break;
    }
  }
}
```

### CommonJS

```js
const { isIncognito } = require('is-incognito-mode');

// Default-import-style:
const detect = require('is-incognito-mode').default;
```

---

## API at a glance

| Export                          | Kind     | Description                                                                          |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `isIncognito(options?)`         | function | Resolves to `boolean`.                                                               |
| `detectIncognito(options?)`     | function | Resolves to a rich `DetectionResult`.                                                |
| `IncognitoDetectionError`       | class    | Typed error with `code: 'NOT_A_BROWSER' \| 'UNSUPPORTED_BROWSER' \| 'PROBE_FAILED'`. |
| `DEFAULT_PRIVATE_QUOTA_BYTES`   | const    | Default threshold (`120 × 1024 × 1024`).                                             |
| `BrowserName` (type)            | type     | Coarse engine name.                                                                  |
| `DetectionResult` (type)        | type     | Rich result shape — see "Usage".                                                     |
| `DetectionConfidence` (type)    | type     | `'high' \| 'medium' \| 'low'`.                                                       |
| `DetectionStrategyName` (type)  | type     | Strategy identifier.                                                                 |
| `DetectIncognitoOptions` (type) | type     | Options bag.                                                                         |

Full generated reference: **<https://yankouskia.github.io/is-incognito-mode/>**

---

## Compatibility

### Browsers

| Engine                 | Detection strategy              | Confidence |
| ---------------------- | ------------------------------- | ---------- |
| Chromium ≥ 80          | `navigator.storage.estimate`    | high       |
| Firefox ≥ 75           | `navigator.storage.estimate`    | high       |
| Safari ≥ 13            | `navigator.storage.estimate`    | high       |
| Older Safari / WebKit  | `localStorage` + `openDatabase` | medium-low |
| Older Firefox          | `indexedDB.open` error path     | low        |
| Edge (legacy)          | `PointerEvent` heuristic        | low        |
| IE 10–11               | `PointerEvent` heuristic        | low        |
| All others (`unknown`) | throws `UNSUPPORTED_BROWSER`    | —          |

### Node / runtimes

Not supported at runtime — this is a **browser-only** package and will throw
`NOT_A_BROWSER` if invoked without a `navigator`. The package _builds_ on
Node ≥ 20.

### Bundlers & frameworks

Ships ESM and CJS with proper `exports` map and `.d.ts` / `.d.cts`. Works
out-of-the-box in Vite, Next.js (client components), Remix, Astro, Webpack,
Rollup, esbuild, Bun, and Deno.

---

## What's new in v2

|                     | v1.x                                                     | v2.0                                                         |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Detection technique | FileSystem API + IndexedDB + localStorage + PointerEvent | `navigator.storage.estimate()` quota (with legacy fallbacks) |
| TypeScript          | shipped JS only                                          | strict TypeScript source, full `.d.ts`                       |
| Module formats      | UMD + CJS                                                | ESM + CJS dual publish                                       |
| Dependencies        | `get-browser`                                            | **zero**                                                     |
| Bundle size         | ~3 kB min+gzip                                           | **~1 kB min+gzip**                                           |
| Engines             | Node ≥ 8                                                 | Node ≥ 20                                                    |
| Error model         | `throw 'string'`                                         | `IncognitoDetectionError` with `code`                        |

See [`BREAKING_CHANGES.md`](./BREAKING_CHANGES.md) for migration recipes
and [`DECISIONS.md`](./DECISIONS.md) for the reasoning behind each big call.

---

## Comparison with alternatives

- **[`detectincognitojs`](https://github.com/Joe12387/detectIncognito)** —
  excellent, similar in spirit. Pick that if you want a UMD bundle or a richer
  per-browser breakdown.
- **Inline UA sniff + `try/catch` around `localStorage`** — broken in every
  modern browser. Don't.
- **Just check `window.webkitRequestFileSystem`** — patched out of Chrome 76.
  Don't.

---

## Contributing

Pull requests welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the dev
loop, conventional commits, and the changeset workflow. Be excellent — the
[Contributor Covenant 2.1](./CODE_OF_CONDUCT.md) applies.

## Security

Report vulnerabilities privately per [`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE) © Aliaksandr Yankouski
