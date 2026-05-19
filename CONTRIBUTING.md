# Contributing

Thanks for taking the time to contribute.

## Dev environment

```sh
# Use the pinned Node version
nvm use            # → 22
corepack enable    # → pnpm

pnpm install
```

## The inner loop

| Command                 | What it does                         |
| ----------------------- | ------------------------------------ |
| `pnpm dev`              | Watch-mode build.                    |
| `pnpm test:watch`       | Vitest in watch mode.                |
| `pnpm test:coverage`    | Single run with coverage report.     |
| `pnpm test:bench`       | Run benchmarks.                      |
| `pnpm typecheck`        | `tsc --noEmit`.                      |
| `pnpm lint`             | ESLint.                              |
| `pnpm lint:fix`         | ESLint with autofix.                 |
| `pnpm format`           | Prettier write.                      |
| `pnpm validate:package` | `publint` + `@arethetypeswrong/cli`. |
| `pnpm size`             | Bundle size budget check.            |

Pre-commit hooks (managed by `simple-git-hooks`) run `lint-staged` to format
and lint staged files. They're installed automatically by `pnpm install`.

## Conventional commits

Use the prefixes:

- `feat:` — new user-visible feature
- `fix:` — bug fix
- `refactor:` — internal change, no behaviour change
- `docs:` — documentation
- `test:` — tests
- `ci:` — CI workflow changes
- `build:` — build / packaging changes
- `chore:` — everything else
- `deps:` — dependency bumps

Append `!` for breaking changes and explain in `BREAKING_CHANGES.md`.

## Changesets

Every PR that changes user-visible behaviour must include a changeset:

```sh
pnpm changeset
```

Pick the right bump type (patch / minor / major) and write the entry in the
voice of a release note. The release workflow turns these into version bumps
and CHANGELOG entries automatically.

## Pull requests

1. Branch from `master` (e.g. `feat/safari-quota-tuning`).
2. Run the full local validation suite before pushing:

   ```sh
   pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm validate:package
   ```

3. CI runs the same matrix across Node 20/22/24 on linux/macos/windows.
4. One approving review + green CI is enough to merge.

## Architecture notes

See [`DECISIONS.md`](./DECISIONS.md) for the ADRs and
[`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) for the v1 → v2 journey.

## Code of conduct

By participating you agree to the
[Contributor Covenant 2.1](./CODE_OF_CONDUCT.md).
