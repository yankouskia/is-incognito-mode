<div align="center">

# `is-incognito-mode`

### **Detect private / incognito browsing in 4 lines of code.**

_Zero dependencies — fully typed — dual ESM + CJS — ~2 kB min+gzip._

[![npm version](https://img.shields.io/npm/v/is-incognito-mode.svg?logo=npm&color=cb3837)](https://www.npmjs.com/package/is-incognito-mode)
[![npm downloads](https://img.shields.io/npm/dm/is-incognito-mode.svg?color=cb3837)](https://www.npmjs.com/package/is-incognito-mode)
[![CI](https://github.com/yankouskia/is-incognito-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/yankouskia/is-incognito-mode/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen?logo=vitest)](./coverage)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/is-incognito-mode?label=min%2Bgzip&color=44cc11)](https://bundlephobia.com/package/is-incognito-mode)
[![Types](https://img.shields.io/npm/types/is-incognito-mode.svg?logo=typescript&color=3178c6)](./src/index.ts)
[![Docs](https://img.shields.io/badge/docs-typedoc-9b5de5?logo=readthedocs&logoColor=white)](https://yankouskia.github.io/is-incognito-mode/)
[![License](https://img.shields.io/npm/l/is-incognito-mode.svg?color=blue)](./LICENSE)

<br />

### **[Try the live demo →](https://yankouskia.github.io/is-incognito-mode/demo/)**

_Open it in a normal window. Then re-open it in private/incognito mode. Watch the verdict flip._

<br />

</div>

---

## 30-second tour

```sh
npm install is-incognito-mode
```

```ts
import { isIncognito } from 'is-incognito-mode';

if (await isIncognito()) {
  showPaywall();
} else {
  trackVisit();
}
```

That's it. **One async call, one boolean.** Works on Chrome, Firefox, Safari,
Edge, and (best-effort) the long tail of older WebKit shells.

Need more than a yes/no? Use [`detectIncognito()`](#rich-detection-result) for
a typed object with `browser`, `confidence`, `quota`, and `strategy` fields.

---

## Why you'd use this

Browsers don't expose a "private mode" API on purpose — but private windows
still leak the fact through **resource limits** and **storage shape**.
`is-incognito-mode` packages the current state-of-the-art per-engine detection
as a tiny, typed, zero-dep module, so you can stop hand-rolling heuristics that
browsers patched out years ago.

A few real-world fits:

| Scenario                  | What you do                                                 |
| ------------------------- | ----------------------------------------------------------- |
| **Soft paywall**          | Discourage incognito bypass without hard-blocking the user. |
| **Respectful analytics**  | Skip beacon calls in private sessions to honor the signal.  |
| **Long forms / surveys**  | Warn before storing state that will vanish on close.        |
| **Fraud / abuse signals** | One input among many — never the sole decider.              |
| **E2E test conditioning** | Branch tests based on whether you're driving a private tab. |

---

## Install

```sh
pnpm add is-incognito-mode      # or  npm i is-incognito-mode
                                # or  yarn add is-incognito-mode
                                # or  bun add is-incognito-mode
```

**No-install — straight from a CDN**:

```html
<script type="module">
  import { isIncognito } from 'https://esm.sh/is-incognito-mode@2';
  console.log(await isIncognito());
</script>
```

---

## See it run

A ready-to-run demo page is hosted alongside the docs:

> **https://yankouskia.github.io/is-incognito-mode/demo/**

Open it once in a regular window, then once in incognito/private — the
verdict, browser, confidence, quota, and strategy update live.
Source: [`examples/browser/index.html`](./examples/browser/index.html) (single
static file, no build step).

---

## How it decides (under the hood)

There is no single cross-browser signal — each engine leaks private mode in a
different place — so the library picks the right probe per engine.

<details>
<summary>Detection flow diagram</summary>

```mermaid
flowchart TD
    A[detectIncognito] --> D{which engine?}
    D -- Chromium --> C1["navigator.storage.estimate()"]
    C1 --> C2{"headroom (quota − usage) &lt; 9.5 GiB?"}
    C2 -- yes --> R1([private — high confidence])
    C2 -- no --> R2([normal — high confidence])
    D -- Firefox --> F1["navigator.storage.getDirectory() — OPFS"]
    F1 --> F2{rejected with a security error?}
    F2 -- yes --> R3([private — high confidence])
    F2 -- no --> R4([normal — high confidence])
    D -- Safari/WebKit --> S1["navigator.storage.getDirectory() — OPFS"]
    S1 --> S2{rejected 'unknown transient reason'?}
    S2 -- yes --> R5([private])
    S2 -- no --> R6([normal])
    D -- Edge legacy / IE --> G[PointerEvent + indexedDB heuristic]
    D -- unknown --> X([throw UNSUPPORTED_BROWSER])
```

</details>

**Chromium (Chrome, Edge, Brave, Opera, …).** Chrome's `predictable-reported-quota`
mitigation (default since Chromium 147) was meant to mask incognito by reporting
a fixed storage quota — but it didn't fully equalize the two modes. Empirically,
`navigator.storage.estimate()` reports `quota = usage + 10 GiB` in a normal tab
and `usage + 9 GiB` in an incognito tab. The library looks at the **headroom**
(`quota − usage`): subtracting `usage` cancels real consumption and leaves just
that offset — a stable **10 GiB vs 9 GiB**. Below 9.5 GiB → incognito. (This
also catches pre-147 Chromium, whose incognito quota was a small dynamic value.)

**Firefox & Safari.** The **Origin Private File System**
(`navigator.storage.getDirectory()`) is rejected in private mode — Firefox
throws a security error, Safari throws "unknown transient reason". A clean
resolve means a normal window.

**Legacy Edge / IE.** No `indexedDB` while `PointerEvent` exists → private.

If you need to override the 9.5 GiB Chromium cutoff, pass
`privateQuotaThresholdBytes` (see [Tuning](#tuning-the-detection)).

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
// → "chromium (high) — strategy: chromium-quota, quota: 9663676416"
```

Fields on `DetectionResult`:

| field        | type                          | notes                                                                                     |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `isPrivate`  | `boolean`                     | Final verdict.                                                                            |
| `browser`    | `BrowserName`                 | Coarse engine: `chromium`, `firefox`, `safari`, `webkit`, `edge-legacy`, `ie`, `unknown`. |
| `confidence` | `'high' \| 'medium' \| 'low'` | `high` for the primary per-engine probe; `low` for legacy heuristics.                     |
| `quota`      | `number \| null`              | `estimate().quota` in bytes (Chromium); `null` for the OPFS and legacy strategies.        |
| `strategy`   | `DetectionStrategyName`       | Which probe produced the verdict — see [How it decides](#how-it-decides-under-the-hood).  |

### Tuning the detection

You normally do not need to configure anything. The Chromium strategy compares
the storage headroom (`estimate().quota − estimate().usage`) to a **9.5 GiB**
cutoff — the midpoint between the 10 GiB Chrome reports for a normal tab and the
9 GiB it reports for an incognito tab. To override that cutoff:

```ts
import { detectIncognito } from 'is-incognito-mode';

const result = await detectIncognito({
  privateQuotaThresholdBytes: 9.5 * 1024 * 1024 * 1024,
});
```

`DEFAULT_PRIVATE_QUOTA_BYTES` (9.5 GiB) is exported as the reference value.

### Injecting globals (for testing)

`detectIncognito` accepts a `globals` override so unit tests don't have to
monkey-patch `navigator` or `window`:

```ts
import { detectIncognito } from 'is-incognito-mode';

const result = await detectIncognito({
  globals: {
    navigator: {
      userAgent: 'Mozilla/5.0 ... Chrome/148.0',
      // Chrome reports quota = usage + 9 GiB for an incognito tab.
      storage: {
        estimate: () => Promise.resolve({ quota: 9 * 1024 ** 3, usage: 0 }),
      },
    },
    window: {},
  },
});
// result.isPrivate === true  (9 GiB headroom < 9.5 GiB)
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
        // The engine's probe could not produce a verdict
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
| `DEFAULT_PRIVATE_QUOTA_BYTES`   | const    | Chromium headroom cutoff (`9.5 GiB`).                                                |
| `BrowserName` (type)            | type     | Coarse engine name.                                                                  |
| `DetectionResult` (type)        | type     | Rich result shape — see "Usage".                                                     |
| `DetectionConfidence` (type)    | type     | `'high' \| 'medium' \| 'low'`.                                                       |
| `DetectionStrategyName` (type)  | type     | Strategy identifier.                                                                 |
| `DetectIncognitoOptions` (type) | type     | Options bag.                                                                         |

Full generated reference: **<https://yankouskia.github.io/is-incognito-mode/>**

---

## Compatibility

### Browsers

| Engine                 | Detection strategy                            | Confidence |
| ---------------------- | --------------------------------------------- | ---------- |
| Chromium (incl. 147+)  | `storage.estimate()` headroom (`quota−usage`) | high       |
| Firefox ≥ 111          | OPFS `navigator.storage.getDirectory()`       | high       |
| Safari ≥ 15.2          | OPFS `navigator.storage.getDirectory()`       | high       |
| Older Safari / WebKit  | `localStorage` + `openDatabase` probes        | medium-low |
| Older Firefox          | `indexedDB.open` error path                   | low        |
| Edge (legacy)          | `PointerEvent` + `indexedDB` heuristic        | low        |
| IE 10–11               | `PointerEvent` + `indexedDB` heuristic        | low        |
| All others (`unknown`) | throws `UNSUPPORTED_BROWSER`                  | —          |

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

|                     | v1.x                                                     | v2.0                                                            |
| ------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Detection technique | FileSystem API + IndexedDB + localStorage + PointerEvent | per-engine probes: Chromium quota headroom, Firefox/Safari OPFS |
| TypeScript          | shipped JS only                                          | strict TypeScript source, full `.d.ts`                          |
| Module formats      | UMD + CJS                                                | ESM + CJS dual publish                                          |
| Dependencies        | `get-browser`                                            | **zero**                                                        |
| Bundle size         | ~3 kB min+gzip                                           | **~2 kB min+gzip** (≈1.2 kB brotli)                             |
| Engines             | Node ≥ 8                                                 | Node ≥ 20                                                       |
| Error model         | `throw 'string'`                                         | `IncognitoDetectionError` with `code`                           |

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
