# is-incognito-mode

Reliably detect whether the user's browser is in private / incognito mode — zero
runtime dependencies, fully typed, dual ESM + CJS.

[![npm version](https://img.shields.io/npm/v/is-incognito-mode.svg?logo=npm)](https://www.npmjs.com/package/is-incognito-mode)
[![npm downloads](https://img.shields.io/npm/dm/is-incognito-mode.svg)](https://www.npmjs.com/package/is-incognito-mode)
[![CI](https://github.com/yankouskia/is-incognito-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/yankouskia/is-incognito-mode/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/yankouskia/is-incognito-mode/master.svg?logo=codecov)](https://codecov.io/gh/yankouskia/is-incognito-mode)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/is-incognito-mode?label=min%2Bgzip)](https://bundlephobia.com/package/is-incognito-mode)
[![Types](https://img.shields.io/npm/types/is-incognito-mode.svg)](./src/index.ts)
[![License](https://img.shields.io/npm/l/is-incognito-mode.svg)](./LICENSE)

> The detection vectors most browsers patched between 2019 and 2023 are gone.
> v2 uses `navigator.storage.estimate()` quota probing — the same technique
> still used by paywalls, analytics opt-outs, and fraud-detection services in 2026.

---

## Why this exists

Browsers don't expose a "private mode" API. They do, however, leak the fact
indirectly through resource limits and storage shape. `is-incognito-mode` wraps
the current state-of-the-art detection in a tiny, typed, dependency-free
package so you don't have to hand-roll the heuristic in every project.

Common use cases:

- Soft paywalls that need to discourage incognito bypass.
- Analytics opt-out signals.
- Surveys / authentication flows that should warn before storing state that
  will vanish when the window closes.
- Fraud signals (one input among many — never the only one).

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

Direct browser load via CDN:

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

Default is **120 MiB**. Devices with very small total storage may produce
false positives — raise the threshold or lower-bound it against
`navigator.deviceMemory * 1 GiB`.

### Injecting globals (testing)

`detectIncognito` accepts a `globals` override so unit tests don't have to
monkey-patch `navigator` or `window`:

```ts
import { detectIncognito } from 'is-incognito-mode';

const result = await detectIncognito({
  globals: {
    navigator: {
      userAgent: 'Mozilla/5.0 ... Chrome/131.0',
      storage: { estimate: () => Promise.resolve({ quota: 32 * 1024 * 1024 }) },
    },
    window: {},
  },
});
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

## API

| Export                          | Kind     | Description                                                                          |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `isIncognito(options?)`         | function | Resolves to `boolean`.                                                               |
| `detectIncognito(options?)`     | function | Resolves to a rich `DetectionResult`.                                                |
| `IncognitoDetectionError`       | class    | Typed error with `code: 'NOT_A_BROWSER' \| 'UNSUPPORTED_BROWSER' \| 'PROBE_FAILED'`. |
| `DEFAULT_PRIVATE_QUOTA_BYTES`   | const    | Default threshold (120 × 1024 × 1024).                                               |
| `BrowserName` (type)            | type     | Coarse engine name.                                                                  |
| `DetectionResult` (type)        | type     | Rich result shape — see "Usage".                                                     |
| `DetectionConfidence` (type)    | type     | `'high' \| 'medium' \| 'low'`.                                                       |
| `DetectionStrategyName` (type)  | type     | Strategy identifier.                                                                 |
| `DetectIncognitoOptions` (type) | type     | Options bag.                                                                         |

Full generated reference: <https://yankouskia.github.io/is-incognito-mode/>.

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

Not supported at runtime — this is a browser-only package and will throw
`NOT_A_BROWSER` if invoked without a `navigator`. The package _builds_ on
Node ≥ 20.

---

## Comparison with alternatives

- **[`detectincognitojs`](https://github.com/Joe12387/detectIncognito)** —
  excellent, similar in spirit. Pick that if you want a UMD bundle or a richer
  per-browser breakdown.
- **Inline UA sniff + `try/catch` around `localStorage`** — broken in every
  modern browser; don't.

---

## Contributing

Pull requests welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the dev
loop, conventional commits, and the changeset workflow. Be excellent — the
[Contributor Covenant 2.1](./CODE_OF_CONDUCT.md) applies.

## Security

Report vulnerabilities privately per [`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE) © Aliaksandr Yankouski
