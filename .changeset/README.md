# Changesets

This directory holds [changeset](https://github.com/changesets/changesets) files
that describe pending releases. Each PR that changes user-facing behaviour
should run `pnpm changeset` and commit the resulting Markdown file.

The release workflow (`.github/workflows/release.yml`) consumes these files,
opens a "Version Packages" PR, and publishes to npm with provenance when that
PR is merged.

See `CONTRIBUTING.md` for the developer workflow.
