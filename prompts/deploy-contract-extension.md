# Recipe: deploy contract extension

Carry one backend deployment field or `DeploymentStatus.state` from the wire
contract through the deploy client, BFF, hook, pure mapper, and requested
Build/Portal surface. Preserve raw units in data layers and format only at the
render boundary.

Work in this order:

1. Add the wire field or state in `packages/deploy/src/wire/**` or
   `packages/deploy/src/types.ts` and update only the known-field normalizer
   under `packages/deploy/src/backend/**`.
2. Add a deploy-client contract test seeded with the supplied backend shape.
3. Carry the value through the owning Build BFF route and path constant with
   ownership scoping and a route regression.
4. Update the project-detail hook and a pure mapper such as
   `deployment-timeline.ts` or `deploy-flow-progress.ts`, each with focused
   tests.
5. Render the requested tab or Portal phase. Branch exhaustively on every
   deployment state and use an `assertNever`-style stop for future states.
6. Version `@aomi-labs/deploy` according to the public contract and hand the
   distribution closure to `//:releaseFanout`.

Do not turn unknown, failed, `no_ci`, or pending states into a building
spinner; fabricate missing metrics as zero; use per-app `Promise.all` where
one 4xx blanks the page; or change unrelated deploy lifecycle semantics.

Required gates: `//packages/deploy:test`, `//apps/build:test`,
`//:deployStatusExhaustive`, and `//:typeCheckApps`.

Evidence: aomi PRs #210, #221, #244, #247, #267, #303, #318, #337, #366, #373, #389, #397, #401, #413, #489, #508, #515, #529.
