# Recipe: release fanout

Ship a change to a publishable frontend package without leaving a stale pin,
generated artifact, registry mirror, or unusable npm manifest. This recipe
implements AGENTS.md's npm publish audit and the release failures repaired in
the PRs cited below.

Work in this order:

1. Derive the changed publishable set from the supplied diff. Limit it to
   `packages/client`, `packages/react`, `packages/account`, `packages/deploy`,
   and `apps/shadcn-registry`.
2. Patch-bump each changed package unless the public API requires a larger
   release. Walk the pin closure `client -> react -> widget-lib`: every
   publishable manifest that pins a bumped package must move too.
3. Compare each proposed version with `npm view <name> version`. Stop and
   report when npm is equal to or ahead of the tree; do not invent a catch-up
   version without review.
4. Rebuild only the tracked dist policy in the current checkout. Then run the
   registry build and copy its complete output to `apps/landing/public/r` when
   registry files changed.
5. Materialize each package with `pnpm pack --pack-destination <temporary>`
   and inspect `package/package.json` for surviving `workspace:` ranges. The
   repository's pinned pnpm 10 rejects the mined plan's `pack --dry-run` flag,
   so a temporary local tarball is the non-publishing proof.
6. Refresh `pnpm-lock.yaml` and finish with every declared gate green.

Do not publish, deploy, edit application source, broaden package APIs, or
rewrite unrelated lockfile resolutions. `//:publish` remains the separate
approval-gated outward action.

Required gates: `//:publishCoherence`, `//:buildPackages`,
`//:registryParityLint`, and `//:registryBuildIntegrity`.

Evidence: aomi PRs #53, #104, #191, #218, #227, #312, #369, #387, #402, #494, #509, #510, #517, #518, #539.
