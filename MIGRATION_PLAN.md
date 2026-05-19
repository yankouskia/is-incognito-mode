# Migration Plan — `is-incognito-mode` v1 → v2

_Living document. Updated as work progresses._

## What this package does

`is-incognito-mode` is a tiny **browser-only** library that returns a `Promise<boolean>` indicating whether the user is in private / incognito browsing mode. It was first published in 2019 and last received a meaningful code change in mid-2019. Since then it received only Dependabot bumps to transitive deps (`elliptic`, `lodash`, `acorn`) — none of which affect runtime behaviour.

The public API is one default export:

```ts
isIncognito(): Promise<boolean>      // rejects if the environment cannot be probed
```

## Current state snapshot (pre-work)

| Aspect                           | Value                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source language                  | ES6 JavaScript (one file, `index.js`, 55 lines)                                                                                                         |
| TypeScript                       | none                                                                                                                                                    |
| Module format shipped            | UMD bundle via Webpack 4 + Babel 7 (`dist/isIncognito.js`)                                                                                              |
| `"type"` field                   | absent (CJS by default)                                                                                                                                 |
| `exports` map                    | absent                                                                                                                                                  |
| `engines.node`                   | unspecified                                                                                                                                             |
| Runtime deps                     | 1 — `get-browser@^1.0.2` (unmaintained, author's own package)                                                                                           |
| Dev deps                         | 5 — `@babel/core`, `@babel/preset-env`, `babel-loader`, `webpack@4`, `webpack-cli@3`                                                                    |
| Tests                            | **none**                                                                                                                                                |
| Coverage                         | 0 %                                                                                                                                                     |
| Linter                           | none                                                                                                                                                    |
| Formatter                        | none (just `.editorconfig`)                                                                                                                             |
| CI                               | **none** — no `.github/workflows/`                                                                                                                      |
| Release automation               | none                                                                                                                                                    |
| Docs site                        | none (one `example/index.html` referenced from README)                                                                                                  |
| README                           | exists, brief, contains a placeholder joke                                                                                                              |
| `LICENSE`                        | MIT                                                                                                                                                     |
| Audit                            | last visible Dependabot bumps in 2020                                                                                                                   |
| Node tested against              | unknown                                                                                                                                                 |
| Browser detection                | via `get-browser` (UA-sniff, returns enum)                                                                                                              |
| Detection vectors used by source | FileSystem API (Chrome/Opera), IndexedDB error (Firefox), `PointerEvent` heuristic (IE/Edge legacy), `localStorage` exception + `openDatabase` (Safari) |

### Baseline tests

There is no test suite. Baseline coverage is **0 %**.

### Findings worth calling out

1. **Every detection technique in the current source is obsolete.** The browser vendors closed each of these fingerprinting vectors between 2019 and 2022:
   - Chrome: the `RequestFileSystem` API is deprecated and no longer differs across normal/incognito (Chrome 76+).
   - Firefox: IndexedDB now works in Private Browsing (Firefox 115+ stable since 2023).
   - Safari: `localStorage` writes succeed in Private mode since Safari 11; `openDatabase` was removed in Safari 18.
   - IE/legacy Edge: both products are EOL.
     The package as currently published will return _wrong_ answers (often `false` / "not incognito") in 2026 browsers.

2. **The runtime dependency `get-browser` is unmaintained** and itself does UA sniffing — fragile. Removing it is desirable.

3. **The build tooling is two major versions behind:** Webpack 4 is EOL, Babel 7's preset-env config targets `> 0.25%` which now includes browsers that don't exist.

4. **There is no test infrastructure of any kind.** No way to know whether changes break anything.

5. **No type definitions ship.** Consumers in TypeScript get `any`.

## Target state (v2.0.0)

- **Pure TypeScript source**, strict-mode-everything, no `any`.
- **Detection rewritten** around `navigator.storage.estimate().quota`, which is the only browser-vendor-blessed-ish signal that still differs in private mode across Chromium, Firefox 75+, and Safari 13+. Layered fallbacks for older browsers and for browsers that don't expose `storage.estimate`. Returns a richer result (still backward-compatible Promise<boolean> by default).
- **Zero runtime dependencies.**
- **Dual ESM + CJS publish** with full `exports` map, sourcemaps, declaration maps. Validates clean under `publint` and `@arethetypeswrong/cli`.
- **Vitest test suite** running under `happy-dom` with per-browser mocks, ≥ 90 % line coverage, `expectTypeOf` checks on the public API.
- **ESLint flat config (v9) + Prettier**, both enforced in CI and via `simple-git-hooks` + `lint-staged`.
- **GitHub Actions**: `ci.yml` (matrix Node 20/22/24 × ubuntu/macos/windows), `release.yml` via Changesets with npm provenance, `codeql.yml`, `docs.yml` deploying TypeDoc to Pages.
- **Modern README** with badges, quickstart, examples, compatibility matrix; CONTRIBUTING / SECURITY / CODE_OF_CONDUCT; TypeDoc-generated reference.
- **Examples directory** with runnable HTML + Vite + Node-import smoke tests.

## Phase-by-phase plan

- [x] **Phase 0** — Reconnaissance + `MIGRATION_PLAN.md` / `DECISIONS.md` / `BREAKING_CHANGES.md`.
- [x] **Phase 1** — Foundation: engines, `tsconfig.json` (strict + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), `package.json` with `exports` map, files allowlist, `.nvmrc` / `.node-version`, browserslist, `packageManager`.
- [x] **Phase 2** — Dependencies: removed webpack/babel/get-browser; modern stack installed; zero runtime deps.
- [x] **Phase 3** — Source rewritten in TypeScript across `browser.ts`, `strategies.ts`, `detect.ts`, `errors.ts`, `types.ts`, `index.ts`.
- [x] **Phase 4** — ESLint v9 flat + Prettier + tsup dual build, lint-staged + simple-git-hooks installed.
- [x] **Phase 5** — Vitest suite, 49 tests, **98.17 % lines / 100 % functions / 90.09 % branches**, type-level tests with `expectTypeOf`, tinybench benchmarks.
- [x] **Phase 6** — `ci.yml` (3 × 3 matrix), `release.yml` (changesets + npm provenance via OIDC), `codeql.yml`, `docs.yml`, dependabot config.
- [x] **Phase 7** — README rewrite, TypeDoc site builds, CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG, issue/PR templates, FUNDING.yml.
- [x] **Phase 8** — Examples (`browser/`, `node-import/`, `vite-react/`), `.gitattributes`, size-limit budget enforced.
- [x] **Phase 9** — Final verification ✓
  - `pnpm install --frozen-lockfile` ✓
  - `pnpm typecheck` ✓ (zero errors)
  - `pnpm lint` ✓ (zero errors, zero warnings)
  - `pnpm test` ✓ (49/49)
  - `pnpm test:coverage` ✓ (above thresholds)
  - `pnpm build` ✓
  - `pnpm validate:package` ✓ (publint "All good!" + attw "No problems found 🌟")
  - `pnpm size` ✓ (1.07 kB / 1.18 kB brotlied; budget 2 kB)
  - `npm pack --dry-run` ✓ (10 files; 15 kB / 80 kB unpacked)
  - Fresh-install smoke test ✓ (ESM / CJS / TS-strict all import cleanly from the tarball; typed error class crosses the module boundary)

## Known limitations

- **`attw` upstream bug**: versions 0.14 – 0.18 use a streaming-Gunzip pattern that only retains the last (empty) chunk, so any package whose decompressed contents exceed one fflate buffer fails with `Cannot read properties of undefined (reading 'filename')`. Worked around with a `pnpm patch` to `@arethetypeswrong/core` that concatenates all chunks. Upstream issue reference: <https://github.com/arethetypeswrong/arethetypeswrong.github.io>. Once an upstream fix lands, drop the patch.

## Risk register

| Risk                                                      | Likelihood | Impact | Mitigation                                                                                                                                                                                           |
| --------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detection logic produces false positives in some browsers | High       | High   | Use a well-known threshold (≈ 120 MB) cross-validated against published research; expose the raw quota in `detectIncognito()` so consumers can tune. Add explicit `confidence` field.                |
| Public API change breaks v1 consumers                     | Medium     | Medium | Keep the default export `() => Promise<boolean>` byte-compatible. Document the new named exports as additive. Major bump anyway because the build output, exports map, and runtime behaviour change. |
| Tests can't run in a real browser in CI                   | Medium     | Low    | Mock `navigator` / `window` shape under `happy-dom`. The detection is small and pure enough to unit-test with mocked globals. Add a runnable example consumers can open in a real browser.           |
| Bundle size regression                                    | Low        | Low    | `size-limit` budget enforced in CI.                                                                                                                                                                  |
| Secrets in git history                                    | Low        | High   | Pre-flight `gitleaks` scan. If anything found, surface it — do not rewrite history.                                                                                                                  |

## Non-goals

- Cross-platform / Node usage. The package is browser-only by definition; it will throw a clear error if invoked outside a browser.
- Supporting browsers older than Safari 13 / Firefox 75 / Chrome 76 / Edge 79 (i.e. anything still based on Chromium, Gecko, or WebKit's 2020-era engines).
- Detecting incognito mode in browser extensions (different APIs apply).
