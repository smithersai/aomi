# Workflow: frontend release train

Open the production release PR only from the prepared `release/YYYY-MM-DD`
branch. The release must preserve the exact candidate tree that passed the
local and live gates; PRs #500 and #511 demonstrate why `main` itself is never
an acceptable release head.

Work in this order:

1. Verify the checked-out head begins with `release/` and resolves to the SHA
   supplied by `releaseCut`. Stop if it is `main`, `prod`, or a different tree.
2. Confirm the hotfix-divergence gate is green. If prod contains tree changes
   after its merge base with main, stop and direct the operator to
   `//.github:backmergePr`.
3. Read the gate results without rerunning or weakening them. The PR body must
   contain an evidence table with the candidate SHA, CI run id, three Vercel
   build ids, `@aomi-labs/client` version, SHA-256 of both OpenAPI fixtures,
   merged-PR count since prod, and any backend-first merge-order note.
4. Open from `release/YYYY-MM-DD` to `prod`. State that any conflict resolution
   changes the candidate tree and invalidates the release.
5. Leave production smoke and the manual rollback workflow as explicit
   post-merge operations.

Do not edit product files, resolve conflicts, publish packages, merge the PR,
target prod from main, or omit unavailable evidence. Missing evidence is a
blocking finding, not an empty table cell.

Required gates: `//:ci`, `//:openapiLive`, `//:publishCoherence`,
`//:registryBuildIntegrity`, and `//.github:hotfixDivergence` on the candidate
SHA. PR creation pauses for approval.

Evidence: aomi PRs #124, #131, #187, #196, #204, #342, #354, #368, #392, #481, #482, #483, #499, #500, #501, #502, #511, #512, #533, #540.
