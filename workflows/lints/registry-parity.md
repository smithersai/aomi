# Lint: registry parity

The shadcn registry (`apps/shadcn-registry`, published as
`@aomi-labs/widget-lib`) is how the widget ships to npm and to `aomi.dev/r`.
AGENTS.md states two publish rules as prose; prose cannot enforce them.

Findings:

1. **Shipped file missing from the registry manifest.** A component, hook,
   theme, or provider added under `apps/shadcn-registry/` (or a widget file
   changed under `packages/react/`) that the registry build would not emit.
2. **Version not bumped.** Shipped files from a publishable package changed
   without a version bump in that package's `package.json` in the same diff.
   Patch unless the release scope requires more.
3. **Stale lockfile or generated artifact** for a published package whose
   manifest changed.

Not findings: changes to private apps (`landing`, `base`, `portal`,
`aomi-build`, `telegram`), test-only edits, docs.

In check mode, report the file, the missing manifest entry or version bump,
and the package affected. In fix mode, add the registry manifest entry or
the version bump, and nothing else.
