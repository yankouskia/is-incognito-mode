# Architecture Decisions

Lightweight ADRs for `is-incognito-mode`. Most recent first.

---

## ADR-010 — Opt-in verdict caching (`cache`)

**Context.** Private / incognito state is fixed for a page load, yet apps often call detection from several places (a paywall gate, an analytics guard, a component mount). Each call re-runs the storage probes — redundant work, and on Chromium an extra `navigator.storage.estimate()` round-trip every time.

**Decision.** Add an opt-in `cache?: boolean` option. When `true`, the **first successful** `DetectionResult` is memoized in a module-level `WeakMap` keyed by the live `navigator` object and returned by every later `cache: true` call.

- **Key = `navigator`.** In a browser that is the page's single `navigator`, so the entry lives exactly as long as the page and is GC'd on unload. Tests and per-request SSR inject fresh `globals`, which yields a fresh key and therefore automatic isolation — no global state, no teardown.
- **Result only, never rejections.** `TIMEOUT` / `ABORTED` / `PROBE_FAILED` are not cached, so a transient failure can't poison later calls.
- **No `clearDetectionCache()`.** A `WeakMap` plus globals-injection already gives correct lifetime and test isolation; an exported clear function would only invite coupling and grow the API surface for no real gain.

**Alternatives considered.**

- Cache the in-flight **promise** (dedupe concurrent calls). Rejected: marginal benefit (detection runs once or twice per page) for real complexity — a rejected shared promise must be evicted carefully to avoid poisoning. Caching the resolved result keeps the contract trivially correct.
- A global singleton cache (not keyed by `navigator`). Rejected: it would leak across injected-`globals` tests and per-request SSR, and couldn't be GC'd.
- Caching on by default. Rejected: it changes behaviour for existing callers and would surprise anyone who varies `privateQuotaThresholdBytes` per call.

**Consequences.** Purely additive and opt-in (off by default — the no-options path is unchanged). ~40 bytes min+gzip. One documented footgun: because the cache stores the verdict and not the inputs, a hit ignores a later call's differing `privateQuotaThresholdBytes`; the JSDoc and README say to leave `cache` off when tuning the threshold per call.

---

## ADR-009 — Bounded, cancelable detection (`timeoutMs` + `signal`)

**Context.** `detectIncognito()` is async and races per-engine storage probes. One probe — Firefox's `indexedDB.open` — resolves only on its `success` / `error` events; in rare states (e.g. a `blocked` upgrade) neither ever fires, so the returned promise can hang forever. `storage.estimate()` / `getDirectory()` can likewise stall. On a critical render path (paywall, analytics gate) an unbounded hang is a real production hazard.

**Decision.** Add two optional, opt-in options: `timeoutMs?: number` (reject with code `TIMEOUT` past the deadline) and `signal?: AbortSignal` (reject with code `ABORTED`). Both funnel through one internal `AbortController` whose signal is threaded into the IndexedDB probe so its event listeners are detached when the probe is abandoned. Two new `IncognitoDetectionErrorCode`s — `TIMEOUT` and `ABORTED` — join the union.

**Alternatives considered.**

- A built-in default timeout (e.g. 5 s). Rejected: it would silently change behaviour for every existing caller. `timeoutMs` stays `undefined` by default; the docs recommend a value instead.
- `AbortSignal.timeout()` / `AbortSignal.any()`. Rejected: neither is available on the stated support floor (Safari 15.2 predates both), so we wire an `AbortController` + `setTimeout` manually for full compatibility.
- Per-strategy timeouts. Rejected: callers reason about wall-clock, not the internal fallback chain — the deadline wraps the whole detection, once.

**Consequences.** Purely additive and backward compatible — the no-options path is byte-for-byte unchanged (fast-pathed to skip the controller/timer entirely). ~300 bytes min+gzip, still well under the 2 kB budget. Zero new dependencies: both `AbortController` and `setTimeout` are web standards.

---

## ADR-008 — Bundle with `tsup`

**Context.** v1 used Webpack 4 + Babel 7 to emit a single UMD bundle. We need dual ESM + CJS + `.d.ts` + sourcemaps with as little config as possible.

**Decision.** Use `tsup` (esbuild under the hood).

**Alternatives considered.**

- `unbuild` — equally good, slightly nicer config. Tsup chosen because it ships sourcemaps and declaration maps in a one-liner config, has wider community familiarity, and is what most 2026-era TS libraries use.
- Raw `tsc` with project references — fine for types-only, but we want both ESM and CJS output without a second build pipeline.
- `rollup` + `@rollup/plugin-typescript` — more knobs than we need.

**Consequences.** No UMD bundle is emitted. Browser-direct consumers get the ESM build via a CDN (`esm.sh`, `unpkg`) — documented in README.

---

## ADR-007 — Drop UMD output

**Context.** v1 shipped a UMD bundle so it could be loaded via a `<script>` tag and read off `window.isIncognito`. The README's `example/index.html` relied on that.

**Decision.** Stop emitting UMD. Ship ESM + CJS only. Update `example/` to use `<script type="module">` and import from a CDN.

**Alternatives.** Keep UMD via tsup's `--format iife` — but UMD is on its way out of the ecosystem and bloats every install. Modern browsers all support `type="module"`.

**Consequences.** Breaking for the very small number of users (if any) who loaded `dist/isIncognito.js` directly via `<script>`. Documented in [`BREAKING_CHANGES.md`](./BREAKING_CHANGES.md).

---

## ADR-006 — Detect via `navigator.storage.estimate().quota`

**Context.** The original detection vectors (FileSystem API quirks, IndexedDB error in Firefox private, `localStorage` exception in Safari, IE/Edge legacy heuristics) have all been closed by browser vendors between 2019 and 2023. The library as published in v1 returns mostly `false` everywhere in 2026.

**Decision.** Use `navigator.storage.estimate()`'s `quota` value as the primary signal. Private/Incognito mode in Chromium, Firefox 75+, and Safari 13+ all expose a noticeably reduced quota (≈ 120 MB or a fraction of total disk, vs. multiple GB / large fraction of free disk in normal mode).

Concrete heuristic: quotas below **~ 120 MB** OR below ~ 0.5 % of `navigator.deviceMemory * 1 GB` are classified as private.

**Alternatives considered.**

- `detectIncognito.js` / `detectincognitojs` packages — could be added as a dependency. We choose to vendor a slim, typed re-implementation so we stay zero-runtime-deps and so we can ship our own typings.
- Drop the package entirely. Rejected because (a) it still has consumers per npm downloads, (b) a working detection still has legitimate uses (analytics opt-out, paywall protection).

**Consequences.** False positives are possible on devices with very small storage. The public API now exposes a richer `detectIncognito()` returning `{ isPrivate, browser, confidence, quota }` so consumers can tune. The boolean default export preserves the v1 contract.

**Reference.** Joe Rutkowski's "Detect Incognito" research — https://github.com/Joe12387/detectIncognito — broadly informs the thresholds.

---

## ADR-005 — ESLint v9 flat config (not Biome)

**Context.** Choice between ESLint flat + Prettier vs. Biome.

**Decision.** ESLint v9 flat config with `typescript-eslint` v8, plus Prettier.

**Alternatives.** Biome is faster and replaces both tools in one binary. We chose ESLint because: (1) `typescript-eslint` rules like `no-floating-promises` and `no-misused-promises` are critical for an async library and Biome doesn't fully match them yet; (2) the ESLint plugin ecosystem (`eslint-plugin-unicorn`, `eslint-plugin-promise`, `eslint-plugin-n`) covers things Biome doesn't.

**Note.** `eslint-plugin-import-x` was evaluated but dropped — the v4 typescript-resolver integration has known compatibility issues with `.ts`-extension imports under `verbatimModuleSyntax`, and TypeScript already validates imports natively, so the duplication wasn't worth the friction.

**Consequences.** Slightly slower lint than Biome would be, but for a ~ 200-line codebase that's irrelevant.

---

## ADR-004 — `pnpm` as package manager

**Context.** Pick a single package manager.

**Decision.** pnpm, pinned via `packageManager` field + corepack.

**Alternatives.** npm (built-in, simpler) or yarn (legacy). pnpm chosen for speed, content-addressable store, and stricter peer-dep resolution.

**Consequences.** Contributors need pnpm (or corepack-enabled Node) to install. Documented in CONTRIBUTING.

---

## ADR-003 — Vitest with `happy-dom`

**Context.** The library is browser-only; we need a DOM-like global. Need a test runner with first-class TS and coverage.

**Decision.** Vitest + happy-dom environment, `@vitest/coverage-v8` provider, hard coverage thresholds.

**Alternatives.** Jest (slower, more config friction with ESM/TS), `node:test` (no browser-globals story).

---

## ADR-002 — Dual ESM + CJS publish

**Context.** Library has both Node-consumed bundler users (Vite, Webpack 5, Rspack) and CJS consumers in some legacy toolchains.

**Decision.** Dual publish with full `exports` conditions:

```json
"exports": {
  ".": {
    "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  }
}
```

Validated by `publint` and `@arethetypeswrong/cli`.

---

## ADR-001 — Major version bump to v2

**Context.** Detection logic, runtime behaviour, build output, and `exports` map all change.

**Decision.** Publish as `2.0.0`. Behaviour-preserving for the most common consumer (`import isIncognito from 'is-incognito-mode'; await isIncognito();`) but enough secondary changes that semver demands a major.

**Alternatives.** v1.2.0 — would mislead consumers about the scope of change.
